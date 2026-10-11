import React from 'react';

export function HeroBanner({ onExplore }) {
  return (
    <section className="fk-hero-section">
      <div className="fk-hero-banner">
        {/* Left Dark Evergreen Panel */}
        <div className="fk-hero-left">
          <h1 className="fk-hero-title">
            Everyday style,<br />made simple
          </h1>
          <p className="fk-hero-subtitle">
            Curated picks for your life<br />at home and beyond
          </p>
          <div className="fk-hero-promo">
            New arrivals and essentials<br />updated daily
          </div>
        </div>

        {/* Right Lifestyle Image */}
        <div className="fk-hero-right">
          <img
            src="/assets/hero-lifestyle.png"
            alt="Everyday style at home and beyond"
            className="fk-hero-image"
          />
        </div>
      </div>
    </section>
  );
}
