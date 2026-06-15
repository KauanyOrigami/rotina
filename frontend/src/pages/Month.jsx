import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, startOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay, getDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';

const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function buildGrid(monthDate) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd   = endOfMonth(monthDate);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const days = [];
  let cur = gridStart;
  while (cur <= monthEnd || days.length % 7 !== 0) {
    days.push(new Date(cur));
    cur = addDays(cur, 1);
    if (days.length >= 42) break;
  }
  return days;
}

const TYPE_COLORS = {
  fixed:    { bg: 'rgba(96,165,250,0.18)',  border: 'rgba(96,165,250,0.5)',  text: '#93c5fd' },
  event:    { bg: 'rgba(124,111,255,0.18)', border: 'rgba(124,111,255,0.5)', text: '#a89fff' },
  habit:    { bg: 'rgba(52,211,153,0.18)',  border: 'rgba(52,211,153,0.5)',  text: '#6ee7b7' },
  academic: { bg: 'rgba(129,140,248,0.18)', border: 'rgba(129,140,248,0.5)', text: '#a5b4fc' },
  work:     { bg: 'rgba(251,146,60,0.18)',  border: 'rgba(251,146,60,0.5)',  text: '#fdba74' },
  personal: { bg: 'rgba(244,114,182,0.18)', border: 'rgba(244,114,182,0.5)', text: '#f9a8d4' },
  other:    { bg: 'rgba(148,163,184,0.18)', border: 'rgba(148,163,184,0.5)', text: '#cbd5e1' },
};

export default function Month() {
  const navigate    = useNavigate();
  const [monthDate, setMonthDate] = useState(new Date());
  const [blocks,    setBlocks]    = useState([]);
  const [habits,    setHabits]    = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fb, hb, tasks] = await Promise.all([
          api.fixedBlocks.list(),
          api.habits.list(),
          api.tasks.list({}),
        ]);
        setBlocks(fb.filter(b => b.is_active !== 0));
        setHabits(hb.filter(h => h.is_active !== 0));
        setEvents(tasks.filter(t => t.is_event && t.event_date));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const today = new Date();
  const grid  = buildGrid(monthDate);

  const goToWeek = (date) => {
    navigate(`/week?date=${format(date, 'yyyy-MM-dd')}`);
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h2>Calendário</h2>
            <p className="text-muted" style={{ textTransform: 'capitalize' }}>
              {format(monthDate, "MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="flex flex-center gap-8">
            <button className="btn btn-ghost btn-sm" onClick={() => setMonthDate(new Date())}>Hoje</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonthDate(d => subMonths(d, 1))}>←</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonthDate(d => addMonths(d, 1))}>→</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <div className="month-cal">
          {/* Day-of-week header */}
          <div className="month-dow-row">
            {DOW.map(d => <div key={d} className="month-dow">{d}</div>)}
          </div>

          {/* Day grid */}
          <div className="month-grid">
            {grid.map((date, idx) => {
              const dateStr = format(date, 'yyyy-MM-dd');
              const inMonth = isSameMonth(date, monthDate);
              const isToday = isSameDay(date, today);
              const dow     = getDay(date);

              const dayBlocks  = blocks.filter(b => b.day_of_week === dow);
              const dayHabits  = habits.filter(h => {
                const days = typeof h.days_of_week === 'string'
                  ? JSON.parse(h.days_of_week) : (h.days_of_week || []);
                return days.includes(dow);
              });
              const dayEvents  = events.filter(e => e.event_date === dateStr);

              const allItems = [
                ...dayBlocks.map(b  => ({ key: b.id,  label: b.label,  kind: 'fixed'              })),
                ...dayEvents.map(e  => ({ key: e.id,  label: e.title,  kind: 'event'              })),
                ...dayHabits.map(h  => ({ key: h.id,  label: h.name,   kind: 'habit'              })),
              ];

              const visible = allItems.slice(0, 3);
              const extra   = allItems.length - visible.length;

              return (
                <div
                  key={idx}
                  className={`month-day ${!inMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}
                  onClick={() => inMonth && goToWeek(date)}
                  title={inMonth ? 'Ver semana' : undefined}
                >
                  <div className="month-day-num">{format(date, 'd')}</div>

                  {inMonth && (
                    <div className="month-day-items">
                      {visible.map(item => {
                        const c = TYPE_COLORS[item.kind] || TYPE_COLORS.other;
                        return (
                          <div key={item.key} className="month-chip"
                            style={{ background: c.bg, borderColor: c.border, color: c.text }}>
                            {item.label}
                          </div>
                        );
                      })}
                      {extra > 0 && (
                        <div className="month-chip-more">+{extra} mais</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="cal-legend" style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
            {[
              { label: 'Bloco fixo', ...TYPE_COLORS.fixed   },
              { label: 'Evento',     ...TYPE_COLORS.event   },
              { label: 'Hábito',     ...TYPE_COLORS.habit   },
            ].map(({ label, border, bg }) => (
              <div key={label} className="flex flex-center gap-8">
                <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: `1px solid ${border}` }} />
                <span className="text-xs text-dim">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
