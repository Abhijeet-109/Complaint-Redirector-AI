import React from 'react';
import { Sparkles, FileText, LifeBuoy, ShieldCheck } from 'lucide-react';
import { WHY_FLATKART_POINTS } from '../../data/demoProducts';

const ICONS = [
  <Sparkles size={22} color="var(--fk-gold)" />,
  <FileText size={22} color="var(--fk-olive)" />,
  <ShieldCheck size={22} color="var(--fk-gold)" />,
  <LifeBuoy size={22} color="var(--fk-olive)" />,
];

export function WhyFlatkart() {
  return (
    <section className="fk-featured-section" style={{ paddingBottom: '36px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 className="fk-section-heading" style={{ marginBottom: '4px' }}>
          Why Flatkart
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--fk-text-muted)' }}>
          Thoughtful e-commerce built around transparency and reliable support
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px',
        }}
      >
        {WHY_FLATKART_POINTS.map((point, idx) => (
          <div
            key={point.id}
            style={{
              backgroundColor: 'var(--fk-surface)',
              borderRadius: '8px',
              padding: '20px 18px',
              border: '1px solid rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                backgroundColor: 'rgba(18, 45, 41, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {ICONS[idx % ICONS.length]}
            </div>
            <div>
              <h3
                style={{
                  fontSize: '14.5px',
                  fontWeight: '700',
                  color: 'var(--fk-text-primary)',
                  marginBottom: '4px',
                }}
              >
                {point.title}
              </h3>
              <p
                style={{
                  fontSize: '12px',
                  color: 'var(--fk-text-muted)',
                  lineHeight: '1.35',
                }}
              >
                {point.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default WhyFlatkart;
