/* Interactive court map.
 *
 * Progressive enhancement. The server renders an SVG of the real coordinates,
 * which paints instantly and is what a crawler and a no-JS visitor see. This
 * upgrades it to a real tiled map only once it scrolls into view, so 206 city
 * pages do not each pay ~900KB up front.
 *
 * Tiles: OpenFreeMap (tiles.openfreemap.org). Free, no API key, no
 * registration, no cookies, data from OpenStreetMap. Attribution is REQUIRED
 * and is not present in their style JSON, so it is set explicitly below.
 * If that service ever degrades, delete the script tag and the SVG remains.
 */
(function () {
  'use strict';

  var host = document.querySelector('[data-courtmap]');
  if (!host || !window.IntersectionObserver) return;

  var data;
  try { data = JSON.parse(host.getAttribute('data-courtmap')); } catch (e) { return; }
  if (!data || !data.points || !data.points.length) return;

  var VENDOR = '/assets/vendor/';
  var STYLE = {
    light: 'https://tiles.openfreemap.org/styles/liberty',
    dark: 'https://tiles.openfreemap.org/styles/dark'
  };
  /* Attribution is rendered server-side in .cmap-note instead of through
     MapLibre's AttributionControl. Passing customAttribution as a string got
     registered twice across style loads, and a server-rendered credit also
     covers the no-JS SVG fallback, which the control never would. */

  function theme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function load(cb) {
    if (window.maplibregl) return cb();
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = VENDOR + 'maplibre-gl.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = VENDOR + 'maplibre-gl.js';
    js.onload = cb;
    js.onerror = function () { host.removeAttribute('data-upgrading'); };
    document.head.appendChild(js);
  }

  function build() {
    var el = document.createElement('div');
    el.className = 'cmap-live';
    host.appendChild(el);

    var map = new maplibregl.Map({
      container: el,
      style: STYLE[theme()],
      bounds: [[data.w, data.s], [data.e, data.n]],
      fitBoundsOptions: { padding: 48 },
      attributionControl: false,
      cooperativeGestures: true      // don't hijack page scroll on touch
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', function () {
      map.addSource('courts', {
        type: 'geojson',
        cluster: true,
        clusterRadius: 46,
        clusterMaxZoom: 13,
        data: {
          type: 'FeatureCollection',
          features: data.points.map(function (p) {
            return {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [p[1], p[0]] },
              properties: { name: p[2], href: p[3], free: p[4] ? 1 : 0, courts: p[5] || 0 }
            };
          })
        }
      });

      map.addLayer({
        id: 'clusters', type: 'circle', source: 'courts', filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#56D364',
          'circle-radius': ['step', ['get', 'point_count'], 16, 5, 21, 15, 27],
          'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(6,24,17,.55)'
        }
      });
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'courts', filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['Noto Sans Bold'], 'text-size': 13
        },
        paint: { 'text-color': '#061811' }
      });
      map.addLayer({
        id: 'court', type: 'circle', source: 'courts', filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['case', ['==', ['get', 'free'], 1], '#56D364', '#D8F35A'],
          'circle-radius': 8, 'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(6,24,17,.55)'
        }
      });

      map.on('click', 'clusters', function (e) {
        var id = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0]
          .properties.cluster_id;
        map.getSource('courts').getClusterExpansionZoom(id).then(function (z) {
          map.easeTo({ center: e.lngLat, zoom: z });
        });
      });

      map.on('click', 'court', function (e) {
        var f = e.features[0], p = f.properties;
        new maplibregl.Popup({ offset: 14, closeButton: true })
          .setLngLat(f.geometry.coordinates)
          .setHTML(
            '<strong>' + p.name + '</strong>' +
            (p.courts ? '<span>' + p.courts + ' courts</span>' : '') +
            '<span>' + (p.free ? 'Free to play' : 'Membership') + '</span>' +
            '<a href="' + p.href + '">View court</a>')
          .addTo(map);
      });

      ['clusters', 'court'].forEach(function (l) {
        map.on('mouseenter', l, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, function () { map.getCanvas().style.cursor = ''; });
      });

      map.resize();
      // 'idle' means tiles are loaded AND drawn. Hiding the SVG on 'load'
      // retires the fallback before anything is actually painted.
      map.once('idle', function () { host.setAttribute('data-live', ''); });
    });

    // Follow the site's light/dark toggle.
    new MutationObserver(function () {
      var want = STYLE[theme()];
      if (map._pcStyle !== want) { map._pcStyle = want; map.setStyle(want); }
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    map._pcStyle = STYLE[theme()];
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) return;   // keep the server-rendered SVG

  var io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    host.setAttribute('data-upgrading', '');
    load(function () { try { build(); } catch (e) { host.removeAttribute('data-upgrading'); } });
  }, { rootMargin: '250px' });
  io.observe(host);
})();
