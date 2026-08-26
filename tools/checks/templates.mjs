/* One page per distinct template on the site.
 *
 * Shared by every Phase I check so they cover the same ground and cannot drift
 * apart. It lives in its own module because importing it from axe.mjs ran the
 * entire axe audit as a side effect — a check that silently takes ten minutes
 * to do somebody else's job is worse than one that fails.
 *
 * The 4,104 generated court pages come from four templates; one page each is
 * audited rather than all of them.
 */
export const TEMPLATES = [
  ['/',                                                     'home'],
  ['/players',                                              'players'],
  ['/organizers',                                           'organizers'],
  ['/clubs',                                                'clubs'],
  ['/community',                                            'community'],
  ['/events/pickle-for-a-purpose/',                         'event'],
  ['/courts/',                                              'courts hub'],
  ['/courts/us',                                            'courts country'],
  ['/courts/us/texas',                                      'courts state'],
  ['/courts/us/texas/austin',                               'courts city'],
  ['/courts/us/texas/austin/all',                           'courts city all'],
  ['/courts/us/texas/austin/austin-tennis-center-21fd1256', 'court detail'],
  ['/courts/methodology',                                   'courts methodology'],
  ['/live-scores',                                          'live scores'],
  ['/demo/',                                                'demo'],
  ['/support',                                              'support'],
  ['/privacy',                                              'privacy'],
  ['/terms',                                                'terms'],
  ['/licenses',                                             'licenses'],
  ['/404',                                                  '404'],
];
