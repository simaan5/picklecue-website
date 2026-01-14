// PickleCue Landing Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    initCarousel();
    initDemoTabs();
    initNavigation();
    initSmoothScroll();
});

// Phone Mockup Carousel
function initCarousel() {
    const slides = document.querySelector('.carousel-slides');
    const dots = document.querySelectorAll('.carousel-dot');
    const prevBtn = document.querySelector('.carousel-prev');
    const nextBtn = document.querySelector('.carousel-next');

    if (!slides || !dots.length) return;

    let currentSlide = 0;
    const totalSlides = dots.length;
    let autoPlayInterval;

    function goToSlide(index) {
        if (index < 0) index = totalSlides - 1;
        if (index >= totalSlides) index = 0;

        currentSlide = index;
        slides.style.transform = `translateX(-${currentSlide * 100}%)`;

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentSlide);
        });
    }

    function nextSlide() {
        goToSlide(currentSlide + 1);
    }

    function prevSlide() {
        goToSlide(currentSlide - 1);
    }

    function startAutoPlay() {
        stopAutoPlay();
        autoPlayInterval = setInterval(nextSlide, 4000);
    }

    function stopAutoPlay() {
        if (autoPlayInterval) {
            clearInterval(autoPlayInterval);
        }
    }

    // Event listeners
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            goToSlide(index);
            startAutoPlay();
        });
    });

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            prevSlide();
            startAutoPlay();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            nextSlide();
            startAutoPlay();
        });
    }

    // Touch/swipe support
    let touchStartX = 0;
    let touchEndX = 0;

    const carousel = document.querySelector('.carousel');
    if (carousel) {
        carousel.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            stopAutoPlay();
        }, { passive: true });

        carousel.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
            startAutoPlay();
        }, { passive: true });
    }

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                nextSlide();
            } else {
                prevSlide();
            }
        }
    }

    // Pause on hover
    const phoneContainer = document.querySelector('.phone-mockup');
    if (phoneContainer) {
        phoneContainer.addEventListener('mouseenter', stopAutoPlay);
        phoneContainer.addEventListener('mouseleave', startAutoPlay);
    }

    // Start autoplay
    startAutoPlay();
}

// Interactive Demo Tabs
function initDemoTabs() {
    const tabs = document.querySelectorAll('.demo-tab');
    const demoInfo = document.querySelector('.demo-info');
    const demoScreen = document.querySelector('.demo-screen');

    if (!tabs.length) return;

    const demoContent = {
        courts: {
            title: 'Find Courts Near You',
            description: 'Discover thousands of pickleball courts across the country. Our interactive map shows real-time availability, court conditions, and community ratings.',
            features: [
                'Search by location, amenities, or rating',
                'Real-time court status updates',
                'Save your favorite courts',
                'Get directions instantly'
            ],
            screen: 'Courts Map View'
        },
        games: {
            title: 'Create & Join Games',
            description: 'Stop playing alone! Create pickup games at your favorite courts or browse nearby games looking for players at your skill level.',
            features: [
                'Set skill level requirements (2.0-5.0+)',
                'Choose game format (singles, doubles, open)',
                'Automatic waitlist management',
                'In-app game reminders'
            ],
            screen: 'Games List View'
        },
        partners: {
            title: 'Find Playing Partners',
            description: 'Our intelligent matching system helps you find players who match your skill level, play style, and schedule.',
            features: [
                'Skill-based matching',
                'View player profiles and stats',
                'Built-in direct messaging',
                'See mutual connections'
            ],
            screen: 'Partner Finder View'
        },
        leagues: {
            title: 'Compete in Leagues',
            description: 'Take your game to the next level with organized competition. Join local leagues and tournaments with multiple formats.',
            features: [
                'Round robin, elimination, ladder formats',
                'Automatic standings calculation',
                'Tournament bracket management',
                'Entry fee and registration tracking'
            ],
            screen: 'Leagues & Tournaments View'
        },
        learn: {
            title: 'Improve Your Game',
            description: 'Access a comprehensive library of drills and tips designed for every skill level. Track your progress and see your improvement over time.',
            features: [
                'Drills for all skill levels',
                'Video tutorials and tips',
                'Progress tracking',
                'Timed practice sessions'
            ],
            screen: 'Learn & Drills View'
        }
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Get content
            const tabId = tab.dataset.tab;
            const content = demoContent[tabId];

            if (content && demoInfo) {
                // Animate out
                demoInfo.style.opacity = '0';
                demoInfo.style.transform = 'translateY(10px)';

                setTimeout(() => {
                    // Update content
                    const h3 = demoInfo.querySelector('h3');
                    const p = demoInfo.querySelector('p');
                    const featuresList = demoInfo.querySelector('.demo-features');

                    if (h3) h3.textContent = content.title;
                    if (p) p.textContent = content.description;
                    if (featuresList) {
                        featuresList.innerHTML = content.features
                            .map(f => `<li>${f}</li>`)
                            .join('');
                    }

                    // Animate in
                    demoInfo.style.opacity = '1';
                    demoInfo.style.transform = 'translateY(0)';
                }, 200);
            }

            if (content && demoScreen) {
                demoScreen.style.opacity = '0';
                setTimeout(() => {
                    demoScreen.textContent = content.screen;
                    demoScreen.style.opacity = '1';
                }, 200);
            }
        });
    });
}

// Mobile Navigation
function initNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (!navToggle || !navLinks) return;

    navToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        navToggle.textContent = navLinks.classList.contains('active') ? '✕' : '☰';
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            navToggle.textContent = '☰';
        });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navLinks.contains(e.target)) {
            navLinks.classList.remove('active');
            navToggle.textContent = '☰';
        }
    });
}

// Smooth Scrolling
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Intersection Observer for animations
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.feature-card, .section-header').forEach(el => {
        observer.observe(el);
    });
}

// Initialize scroll animations after page load
window.addEventListener('load', initScrollAnimations);
