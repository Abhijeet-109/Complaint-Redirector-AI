import React, { useState } from 'react';
import { MapPin } from 'lucide-react';

export function CategoryNav({ activeCategory, onSelectCategory }) {
  const [currentPostal, setCurrentPostal] = useState('560001 Bengaluru');
  const [isEditingPostal, setIsEditingPostal] = useState(false);

  const navItems = [
    'Home',
    'Men',
    'Women',
    'Kids',
    'Home & Living',
    'Beauty',
    'Electronics',
    'Spara',
    'Boaliss',
    'Jr',
    'Dvala',
  ];

  return (
    <nav className="fk-secondary-nav">
      <div className="fk-nav-links">
        {navItems.map((item) => {
          const isActive = (activeCategory || 'Home').toLowerCase() === item.toLowerCase();
          return (
            <button
              key={item}
              className={`fk-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectCategory && onSelectCategory(item)}
            >
              {item}
            </button>
          );
        })}
      </div>

      <div
        className="fk-nav-delivery"
        onClick={() => {
          const newCode = prompt('Enter delivery pincode / city:', currentPostal);
          if (newCode && newCode.trim()) {
            setCurrentPostal(newCode.trim());
          }
        }}
        title="Click to change delivery location"
      >
        <MapPin size={18} strokeWidth={2.2} color="var(--fk-text-primary)" />
        <div className="fk-delivery-text">
          <span className="fk-delivery-label">Deliver to</span>
          <span className="fk-delivery-value">{currentPostal}</span>
        </div>
      </div>
    </nav>
  );
}
