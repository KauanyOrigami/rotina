import React from 'react';

export function Modal({ title, onClose, onSave, saveLabel = 'Salvar', children, saving }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>
        {children}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Salvando...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({ value, onChange, label }) {
  return (
    <div className="toggle" style={{ cursor: 'pointer' }} onClick={() => onChange(!value)}>
      <div className={`toggle-track ${value ? 'on' : ''}`}>
        <div className="toggle-thumb" />
      </div>
      {label && <span className="toggle-label">{label}</span>}
    </div>
  );
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function CheckboxDays({ value = [], onChange }) {
  const toggle = (day) => {
    const next = value.includes(day) ? value.filter(d => d !== day) : [...value, day];
    onChange(next);
  };
  return (
    <div className="checkbox-group">
      {DAY_LABELS.map((label, idx) => (
        <label key={idx} className={`checkbox-pill ${value.includes(idx) ? 'checked' : ''}`}>
          <input type="checkbox" checked={value.includes(idx)} onChange={() => toggle(idx)} />
          {label}
        </label>
      ))}
    </div>
  );
}

export function StressBar({ weight, max = 5 }) {
  return (
    <div className="stress-bar">
      {Array.from({ length: max }, (_, i) => (
        <div key={i} className={`stress-dot ${i < weight ? `filled-${Math.min(weight, 5)}` : ''}`} />
      ))}
    </div>
  );
}

export function ActivityBadge({ type }) {
  const map = {
    exercise: { label: 'Exercício', cls: 'badge-green' },
    reading:  { label: 'Leitura',   cls: 'badge-blue' },
    study:    { label: 'Estudo',     cls: 'badge-accent' },
    leisure:  { label: 'Lazer',      cls: 'badge-amber' },
    rest:     { label: 'Descanso',   cls: 'badge-gray' },
    academic: { label: 'Faculdade',  cls: 'badge-accent' },
    work:     { label: 'Trabalho',   cls: 'badge-blue' },
    personal: { label: 'Pessoal',    cls: 'badge-gray' },
    other:    { label: 'Outro',      cls: 'badge-gray' },
  };
  const m = map[type] || map['other'];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function EffortBadge({ effort }) {
  const map = {
    low:    { label: 'Leve',    cls: 'badge-green' },
    medium: { label: 'Médio',   cls: 'badge-amber' },
    high:   { label: 'Intenso', cls: 'badge-red' },
  };
  const m = map[effort] || map['medium'];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function EmptyState({ icon, message, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <p className="text-muted">{message}</p>
      {action}
    </div>
  );
}
