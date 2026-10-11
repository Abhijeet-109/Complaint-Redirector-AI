import React from 'react';
import { POPULAR_BRANDS } from '../../data/demoProducts';

export function PopularBrands({ onSelectBrand }) {
  return (
    <section className="fk-featured-section">
      <div style={{ marginBottom: '14px' }}>
        <h2 className="fk-section-heading" style={{ marginBottom: '4px' }}>
          Brands to Know
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
          Authentic labels crafted for quality and durability
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px',
        }}
      >
        {POPULAR_BRANDS.map((brand) => (
          <div
            key={brand.id}
            onClick={() => onSelectBrand && onSelectBrand(brand.name)}
            style={{
              backgroundColor: 'var(--fk-surface)',
              borderRadius: '6px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              border: '1px solid rgba(0, 0, 0, 0.04)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
              e.currentTarget.style.borderColor = 'var(--fk-gold)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = 'rgba(0, 0, 0, 0.04)';
            }}
          >
            <div
              style={{
                fontSize: '16px',
                fontWeight: '800',
                color: 'var(--fk-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              {brand.name}
            </div>
            <div
              style={{
                fontSize: '11.5px',
                color: 'var(--fk-text-muted)',
                marginTop: '3px',
              }}
            >
              {brand.tag}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default PopularBrands;
