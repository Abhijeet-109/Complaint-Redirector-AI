import React from 'react';
import { LIFESTYLE_CATEGORIES } from '../../data/demoProducts';
import { ArrowUpRight } from 'lucide-react';

export function LifestyleSection({ onSelectCategory }) {
  return (
    <section className="fk-featured-section">
      <div style={{ marginBottom: '14px' }}>
        <h2 className="fk-section-heading" style={{ marginBottom: '4px' }}>
          Find Your Style
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
          Curated lifestyle moods designed for everyday living
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '18px',
        }}
      >
        {LIFESTYLE_CATEGORIES.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectCategory && onSelectCategory(item.categoryName)}
            style={{
              backgroundColor: 'var(--fk-surface)',
              borderRadius: '8px',
              overflow: 'hidden',
              cursor: 'pointer',
              border: '1px solid rgba(0, 0, 0, 0.04)',
              boxShadow: '0 1px 6px rgba(0, 0, 0, 0.03)',
              transition: 'transform 0.25s ease, box-shadow 0.25s ease',
              display: 'flex',
              flexDirection: 'column',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-3px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'none';
              e.currentTarget.style.boxShadow = '0 1px 6px rgba(0, 0, 0, 0.03)';
            }}
          >
            <div
              style={{
                width: '100%',
                height: '140px',
                backgroundColor: '#EAE6DB',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={item.image}
                alt={item.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transition: 'transform 0.3s ease',
                }}
              />
            </div>
            <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--fk-text-primary)' }}>
                    {item.title}
                  </h3>
                  <ArrowUpRight size={16} color="var(--fk-olive)" />
                </div>
                <p style={{ fontSize: '11.5px', color: 'var(--fk-text-muted)', lineHeight: '1.3' }}>
                  {item.subtitle}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default LifestyleSection;
