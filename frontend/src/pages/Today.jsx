import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { StressBar, ActivityBadge, EffortBadge } from '../components/Shared';

const DAY_NAMES = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

function groupSlotsByWindow(slots, freeWindows) {
  const groups = freeWindows.map(w => ({ window: w, suggestions: [] }));
  for (const slot of slots) {
    const slotStart = slot.suggested_start;
    const match = groups.find(g =>
      slotStart >= g.window.start && slotStart <= g.window.end
    );
    if (match) match.suggestions.push(slot);
    else groups[groups.length - 1]?.suggestions.push(slot);
  }
  return groups.filter(g => g.suggestions.length > 0);
}

function ActivityIcon({ type }) {
  const icons = {
    exercise: '🏋️', reading: '📖', study: '📚', leisure: '🎮',
    rest: '😴', academic: '🎓', work: '💼', personal: '✅', other: '📌',
  };
  return <span style={{ fontSize: 16 }}>{icons[type] || '📌'}</span>;
}

export default function Today() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSlots, setSelectedSlots] = useState({});
  const [confirming, setConfirming] = useState({});

  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.dayPlan.get(dateStr);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { load(); }, [load]);

  const handleSelect = (windowKey, slotId) => {
    setSelectedSlots(prev => ({ ...prev, [windowKey]: slotId }));
  };

  const handleConfirm = async (windowKey) => {
    const slotId = selectedSlots[windowKey];
    if (!slotId) return;
    setConfirming(prev => ({ ...prev, [windowKey]: true }));
    try {
      await api.slots.updateStatus(slotId, 'confirmed');
      // Skip the other suggestions in the same window
      const group = groupSlotsByWindow(data.slots, data.freeWindows)
        .find(g => g.window.start === windowKey);
      if (group) {
        for (const s of group.suggestions) {
          if (s.id !== slotId && s.status === 'suggested') {
            await api.slots.updateStatus(s.id, 'skipped');
          }
        }
      }
      await load();
    } finally {
      setConfirming(prev => ({ ...prev, [windowKey]: false }));
    }
  };

  const handleDone = async (slotId) => {
    await api.slots.updateStatus(slotId, 'done');
    await load();
  };

  const handleSkip = async (slotId) => {
    await api.slots.updateStatus(slotId, 'skipped');
    await load();
  };

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Carregando plano do dia...</div>;
  if (!data) return null;

  const { plan, slots, dayWeight, freeWindows } = data;
  const confirmedSlots = slots.filter(s => s.status === 'confirmed');
  const doneSlots = slots.filter(s => s.status === 'done');
  const pendingGroups = groupSlotsByWindow(
    slots.filter(s => s.status === 'suggested'),
    freeWindows
  );

  const stressLabel = ['', 'Tranquilo', 'Tranquilo', 'Moderado', 'Pesado', 'Muito pesado'][dayWeight] || 'Normal';
  const stressColor = dayWeight <= 2 ? 'var(--green)' : dayWeight <= 3 ? 'var(--amber)' : 'var(--red)';

  return (
    <div>
      <div className="page-header">
        <h2>Hoje — {format(today, "EEEE, d 'de' MMMM", { locale: ptBR })}</h2>
        <div className="flex flex-center gap-12 mt-4">
          <p className="text-muted">Plano do dia com base nos seus blocos e pendências</p>
          <div className="flex flex-center gap-8">
            <StressBar weight={dayWeight} />
            <span style={{ fontSize: 12, color: stressColor, fontWeight: 500 }}>{stressLabel}</span>
          </div>
        </div>
      </div>

      {/* Janelas livres com sugestões */}
      {pendingGroups.length > 0 && (
        <>
          <p className="section-title">Janelas livres — escolha o que fazer</p>
          {pendingGroups.map(({ window, suggestions }) => (
            <div className="suggestions-window" key={window.start}>
              <div className="suggestions-header">
                <span className="font-mono" style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {window.start} – {window.end}
                </span>
                <span className="badge badge-gray">{window.available_minutes}min disponíveis</span>
              </div>
              <div className="suggestions-list">
                {suggestions.map(slot => {
                  const isSelected = selectedSlots[window.start] === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className={`suggestion-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(window.start, slot.id)}
                    >
                      <ActivityIcon type={slot.activity_type} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{slot.source_name}</div>
                        <div className="flex flex-center gap-8 mt-4">
                          <span className="font-mono text-xs text-dim">
                            {slot.suggested_start} – {slot.suggested_end}
                          </span>
                          <ActivityBadge type={slot.activity_type} />
                          {slot.effort && <EffortBadge effort={slot.effort} />}
                          <span className="badge badge-gray">{slot.source_type === 'habit' ? 'Hábito' : 'Tarefa'}</span>
                        </div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border2)'}`, background: isSelected ? 'var(--accent)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedSlots[window.start] && (
                <button
                  className="btn btn-primary w-full"
                  style={{ marginTop: 10 }}
                  onClick={() => handleConfirm(window.start)}
                  disabled={confirming[window.start]}
                >
                  {confirming[window.start] ? 'Confirmando...' : '✓ Confirmar escolha'}
                </button>
              )}
            </div>
          ))}
        </>
      )}

      {/* Slots confirmados */}
      {confirmedSlots.length > 0 && (
        <>
          <p className="section-title">Agendado para hoje</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {confirmedSlots.map(slot => (
              <div key={slot.id} className={`slot-card ${slot.status}`}>
                <ActivityIcon type={slot.activity_type} />
                <div className="slot-time">{slot.suggested_start} – {slot.suggested_end}</div>
                <div className="slot-name">{slot.source_name}</div>
                <ActivityBadge type={slot.activity_type} />
                <div className="slot-actions">
                  <button className="btn btn-success btn-sm" onClick={() => handleDone(slot.id)}>✓ Feito</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleSkip(slot.id)}>Pular</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Concluídos */}
      {doneSlots.length > 0 && (
        <>
          <p className="section-title">Concluídos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneSlots.map(slot => (
              <div key={slot.id} className="slot-card done">
                <ActivityIcon type={slot.activity_type} />
                <div className="slot-time">{slot.suggested_start} – {slot.suggested_end}</div>
                <div className="slot-name" style={{ textDecoration: 'line-through' }}>{slot.source_name}</div>
                <span className="badge badge-green">✓</span>
              </div>
            ))}
          </div>
        </>
      )}

      {pendingGroups.length === 0 && confirmedSlots.length === 0 && doneSlots.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🌅</div>
          <p className="text-muted">Nenhuma sugestão para hoje. Configure hábitos e tarefas para começar.</p>
        </div>
      )}
    </div>
  );
}
