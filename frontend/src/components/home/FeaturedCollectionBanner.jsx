import React from 'react';
import { ArrowRight } from 'lucide-react';

export function FeaturedCollectionBanner({ onExplore }) {
  return (
    <section className="fk-featured-section">
      <div
        style={{
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: 'var(--fk-hero)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.06)',
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          minHeight: '220px',
        }}
      >
        <div
          style={{
            padding: '36px 42px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--fk-gold)',
              marginBottom: '10px',
            }}
          >
            Editorial Collection
          </span>
          <h2
            style={{
              color: '#FFFFFF',
              fontSize: '28px',
              fontWeight: '800',
              letterSpacing: '-0.02em',
              lineHeight: '1.2',
              marginBottom: '12px',
            }}
          >
            Little things. Better everyday.
          </h2>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.85)',
              fontSize: '14.5px',
              lineHeight: '1.4',
              maxWidth: '480px',
              marginBottom: '20px',
            }}
          >
            Explore thoughtful essentials for your style, space, and routine.
          </p>
          <div>
            <button
              onClick={() => onExplore && onExplore('Home')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--fk-gold)',
                color: '#122D29',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '13.5px',
                fontWeight: '700',
                cursor: 'pointer',
                border: 'none',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#d8b970')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--fk-gold)')}
            >
              <span>Explore the collection</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
          <img
            src="/assets/hero-lifestyle.png"
            alt="Editorial collection lifestyle"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      </div>
    </section>
  );
}

export default FeaturedCollectionBanner;
