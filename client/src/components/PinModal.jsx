import React, { useState } from 'react';

export default function PinModal({ isOpen, onClose, onSuccess }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handlePress = (num) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError('');

      if (nextPin.length === 4) {
        setTimeout(async () => {
          try {
            const res = await fetch('/api/auth/pin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin: nextPin })
            });
            const data = await res.json();
            if (data.success) {
              setPin('');
              onSuccess();
            } else {
              setError(data.message || 'Falsche PIN');
              setPin('');
            }
          } catch (err) {
            setError('Netzwerkfehler');
            setPin('');
          }
        }, 150);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="pin-box">
        <div className="pin-title">🛡️ PIN erforderlich</div>
        <div className="pin-subtitle">Bitte 4-stellige Eltern-PIN eingeben</div>

        <div className="pin-dots">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className={`pin-dot ${idx < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {error && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 600 }}>{error}</div>}

        <div className="pin-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button key={num} className="pin-key" onClick={() => handlePress(num)}>{num}</button>
          ))}
          <button className="pin-key" style={{ gridColumn: 2 }} onClick={() => handlePress('0')}>0</button>
        </div>

        <button
          className="pill-btn"
          style={{ margin: '20px auto 0 auto', opacity: 0.8 }}
          onClick={onClose}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
