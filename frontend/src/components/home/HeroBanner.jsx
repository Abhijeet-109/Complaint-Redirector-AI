import React, { useState, useEffect, useRef } from 'react';

const SLIDES = [
  {
    id: 1,
    title: 'Everyday style,\nmade simple',
    subtitle: 'Curated picks for your life\nat home and beyond',
    promo: 'New arrivals and essentials\nupdated daily',
    image: '/assets/hero_slide_1.jpg',
    alt: 'Everyday style at home and beyond',
  },
  {
    id: 2,
    title: 'A fresh look,\nevery day',
    subtitle: 'Discover versatile styles\nfor every occasion',
    promo: 'Explore the latest\nseasonal collections',
    image: '/assets/hero_slide_2.jpg',
    alt: 'Fresh look and versatile styles',
  },
  {
    id: 3,
    title: 'Make your space\nfeel like home',
    subtitle: 'Thoughtful finds for comfortable,\nbeautiful living',
    promo: 'Discover home essentials\nand decor',
    image: '/assets/hero_slide_3.jpg',
    alt: 'Home & living collection',
  },
  {
    id: 4,
    title: 'Smart picks for\nmodern living',
    subtitle: 'Explore useful technology\nand everyday accessories',
    promo: 'Find your next favourite\nessentials',
    image: '/assets/hero_slide_4.jpg',
    alt: 'Everyday tech and accessories',
  },
];

export function HeroBanner({ onExplore }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const slideCount = SLIDES.length;
  const timerRef = useRef(null);

  // Check prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Auto-advance every 4.5 seconds (within 4-5s requirement)
  useEffect(() => {
    if (isPaused || prefersReducedMotion) return;

    timerRef.current = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slideCount);
    }, 4500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, slideCount, prefersReducedMotion]);

  // Interactive Dot Navigation
  const handleDotClick = (index) => {
    setCurrentSlide(index);
    // Restart automatic interval from the selected slide
    if (timerRef.current) clearInterval(timerRef.current);
    if (!isPaused && !prefersReducedMotion) {
      timerRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % slideCount);
      }, 4500);
    }
  };

  const current = SLIDES[currentSlide];

  return (
    <section
      className="fk-hero-section"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Promotional Hero Carousel"
    >
      <div className="fk-hero-banner" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Left Dark Evergreen Panel */}
        <div className="fk-hero-left">
          <h1
            className="fk-hero-title"
            style={{
              whiteSpace: 'pre-line',
              transition: 'opacity 0.35s ease',
            }}
          >
            {current.title}
          </h1>
          <p
            className="fk-hero-subtitle"
            style={{
              whiteSpace: 'pre-line',
              transition: 'opacity 0.35s ease',
            }}
          >
            {current.subtitle}
          </p>
          <div
            className="fk-hero-promo"
            style={{
              whiteSpace: 'pre-line',
              transition: 'opacity 0.35s ease',
            }}
          >
            {current.promo}
          </div>
        </div>

        {/* Right Lifestyle Image (Smooth Right-to-Left Sliding Carousel) */}
        <div className="fk-hero-right" style={{ position: 'relative', overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              width: `${slideCount * 100}%`,
              height: '100%',
              transform: `translateX(-${(currentSlide * 100) / slideCount}%)`,
              transition: prefersReducedMotion
                ? 'none'
                : 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            {SLIDES.map((slide) => (
              <div
                key={slide.id}
                style={{
                  width: `${100 / slideCount}%`,
                  height: '100%',
                  flexShrink: 0,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={slide.image}
                  alt={slide.alt}
                  className="fk-hero-image"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Four Pagination Dots (No arrow buttons) */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '35px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 20,
          }}
          role="tablist"
          aria-label="Slide controls"
        >
          {SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => handleDotClick(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              aria-selected={currentSlide === idx}
              role="tab"
              style={{
                width: currentSlide === idx ? '26px' : '9px',
                height: '9px',
                borderRadius: '5px',
                backgroundColor:
                  currentSlide === idx ? 'var(--fk-gold)' : 'rgba(255, 255, 255, 0.45)',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                transition: 'all 0.35s ease',
                boxShadow: currentSlide === idx ? '0 0 6px rgba(194, 161, 90, 0.6)' : 'none',
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default HeroBanner;
