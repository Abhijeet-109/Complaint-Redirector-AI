import React from 'react';
import './Footer.css';

export function Footer({ onNavigate }) {
  const navigate = (event, page) => {
    event.preventDefault();
    onNavigate?.(page);
  };

  return (
    <footer className="fk-site-footer">
      <div className="fk-site-footer-main">
        <div>
          <a href="/" className="fk-site-footer-brand" onClick={(event) => navigate(event, 'home')}>
            FLATKART
          </a>
          <p>Thoughtful finds for everyday living.</p>
        </div>
        <nav className="fk-site-footer-nav" aria-label="Footer navigation">
          <a href="/" onClick={(event) => navigate(event, 'home')}>Shop</a>
          <a href="/my-complaints" onClick={(event) => navigate(event, 'my-complaints')}>Orders &amp; complaints</a>
          <a href="/login" onClick={(event) => navigate(event, 'login')}>Sign in</a>
          <a href="/register" onClick={(event) => navigate(event, 'register')}>Create account</a>
        </nav>
      </div>
      <div className="fk-site-footer-bottom">
        <span>© {new Date().getFullYear()} Flatkart</span>
        <span className="fk-site-footer-signature">Abhijeet</span>
      </div>
    </footer>
  );
}

export default Footer;
