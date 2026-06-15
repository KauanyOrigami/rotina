import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { StressBar } from '../components/Shared';

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOUR_HEIGHT = 56;
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function getWeekStart(date) {
  return startOfWeek(date, { weekStartsOn: 0 });
}

function timeToTop(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  const top = (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
  return Math.max(0, top);
}

function timeToHeight(s, e) {
  if (!s || !e) return 28;
  const [sh, sm] = s.split(':').map(Number);
  const [eh, em] = e.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return Math.max(22, (mins / 60) * HOUR_HEIGHT);
}

function blockColor(kind, taskType) {
  if (kind === 'fixed')        return { bg: 'rgba(96,165,250,0.16)',  border: '#60a5fa', text: '#93c5fd' };
  if (kind === 'event')        return { bg: 'rgba(124,111,255,0.18)', border: '#7c6fff', text: '#a89fff' };
  if (kind === 'habit')        return { bg: 'rgba(52,211,153,0.15)',  border: '#34d399', text: '#6ee7b7' };
  if (taskType === 'academic') return { bg: 'rgba(129,140,248,0.15)', border: '#818cf8', text: '#a5b4fc' };
  if (taskType === 'work')     return { bg: 'rgba(251,146,60,0.15)',  border: '#fb923c', text: '#fdba74' };
  if (taskType === 'personal') return { bg: 'rgba(244,114,182,0.15)', border: '#f472b6', text: '#f9a8d4' };
  return                              { bg: 'rgba(148,163,184,0.15)', border: '#94a3b8', text: '#cbd5e1' };
}

const LEGEND = [
  { label: 'Bloco fixo',       color: '#60a5fa', bg: 'rgba(96,165,250,0.16)'  },
  { label: 'Evento',           color: '#7c6fff', bg: 'rgba(124,111,255,0.18)' },
  { label: 'Hábito',           color: '#34d399', bg: 'rgba(52,211,153,0.15)'  },
  { label: 'Estudo/acadêmico', color: '#818cf8', bg: 'rgba(129,140,248,0.15)' },
  { label: 'Trabalho',         color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
  { label: 'Pessoal',          color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  { label: 'Outro',            color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
];

export default function Week() {
  const [searchParams] = useSearchParams();
  const paramDate = searchParams.get('date');
  const initialDate = paramDate ? new Date(paramDate + 'T12:00:00') : new Date();

  const [weekData,    setWeekData]    = useState([]);
  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [currentDate, setCurrentDate] = useState(initialDate);
  const scrollRef = useRef(null);

  const weekStart    = getWeekStart(currentDate);
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [data, allTasks] = await Promise.all([
          api.weekPlan.get(weekStartStr),
          api.tasks.list({}),
        ]);
        setWeekData(data);
        setEvents(allTasks.filter(t => t.is_event && t.event_date));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [weekStartStr]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      const now = new Date();
      const topPx = (now.getHours() - START_HOUR) * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
      scrollRef.current.scrollTop = Math.max(0, topPx - 120);
    }
  }, [loading]);

  const prevWeek = () => setCurrentDate(d => addDays(d, -7));
  const nextWeek = () => setCurrentDate(d => addDays(d, 7));
  const goToday  = () => setCurrentDate(new Date());

  const today  = new Date();
  const nowTop = (today.getHours() - START_HOUR) * HOUR_HEIGHT + (today.getMinutes() / 60) * HOUR_HEIGHT;

  const hasAllDay = events.some(e => !e.start_time && weekData.some(d => d.date === e.event_date));

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h2>Agenda da Semana</h2>
            <p className="text-muted">
              {format(weekStart, "d 'de' MMMM", { locale: ptBR })} –{' '}
              {format(addDays(weekStart, 6), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </p>
          </div>
          <div className="flex flex-center gap-8">
            <button className="btn btn-ghost btn-sm" onClick={goToday}>Hoje</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={prevWeek}>←</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={nextWeek}>→</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-muted">Carregando...</div>
      ) : (
        <div className="cal-container">
          <div className="cal-scroll" ref={scrollRef}>

            {/* Sticky day headers */}
            <div className="cal-header-row">
              <div className="cal-gutter" />
              {weekData.map(day => {
                const date    = new Date(day.date + 'T12:00:00');
                const isToday = isSameDay(date, today);
                return (
                  <div key={day.date} className={`cal-day-header ${isToday ? 'today' : ''}`}>
                    <span className="cal-day-name">{DAY_SHORT[day.dayOfWeek]}</span>
                    <span className={`cal-day-num ${isToday ? 'today' : ''}`}>{format(date, 'd')}</span>
                    {day.plan && (
                      <div style={{ marginTop: 4 }}>
                        <StressBar weight={day.plan.overall_stress_weight} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* All-day row */}
            {hasAllDay && (
              <div className="cal-allday-row">
                <div className="cal-gutter cal-allday-label">Dia todo</div>
                {weekData.map(day => {
                  const chips = events.filter(e => e.event_date === day.date && !e.start_time);
                  return (
                    <div key={day.date} className="cal-allday-col">
                      {chips.map(e => {
                        const c = blockColor('event');
                        return (
                          <div key={e.id} className="cal-allday-chip"
                            style={{ background: c.bg, borderColor: c.border, color: c.text }}>
                            {e.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Time grid */}
            <div className="cal-grid-body" style={{ height: TOTAL_HEIGHT }}>

              {/* Hour label column */}
              <div className="cal-gutter cal-time-col">
                {HOURS.map(h => (
                  <div key={h} className="cal-hour-label" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekData.map(day => {
                const date    = new Date(day.date + 'T12:00:00');
                const isToday = isSameDay(date, today);
                const confirmed = (day.slots || []).filter(s => ['confirmed', 'done'].includes(s.status));
                const timedEvts = events.filter(e => e.event_date === day.date && e.start_time);

                return (
                  <div key={day.date} className={`cal-day-col ${isToday ? 'today' : ''}`}>

                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div key={h} className="cal-hour-line" style={{ top: (h - START_HOUR) * HOUR_HEIGHT }} />
                    ))}

                    {/* Current time */}
                    {isToday && nowTop >= 0 && nowTop <= TOTAL_HEIGHT && (
                      <div className="cal-now-line" style={{ top: nowTop }} />
                    )}

                    {/* Fixed blocks */}
                    {(day.fixedBlocks || []).map(block => {
                      const top    = timeToTop(block.start_time);
                      const height = timeToHeight(block.start_time, block.end_time);
                      if (top === null) return null;
                      const c = blockColor('fixed');
                      return (
                        <div key={block.id} className="cal-block"
                          style={{ top, height, background: c.bg, borderLeftColor: c.border, color: c.text }}>
                          <div className="cal-block-name">{block.label}</div>
                          <div className="cal-block-time">{block.start_time}–{block.end_time}</div>
                        </div>
                      );
                    })}

                    {/* Timed events */}
                    {timedEvts.map(event => {
                      const top    = timeToTop(event.start_time);
                      const height = event.end_time ? timeToHeight(event.start_time, event.end_time) : 32;
                      if (top === null) return null;
                      const c = blockColor('event');
                      return (
                        <div key={event.id} className="cal-block"
                          style={{ top, height, background: c.bg, borderLeftColor: c.border, color: c.text }}>
                          <div className="cal-block-name">{event.title}</div>
                          {event.end_time && (
                            <div className="cal-block-time">{event.start_time}–{event.end_time}</div>
                          )}
                        </div>
                      );
                    })}

                    {/* Scheduled slots */}
                    {confirmed.map(slot => {
                      const top    = timeToTop(slot.suggested_start);
                      const height = timeToHeight(slot.suggested_start, slot.suggested_end);
                      if (top === null) return null;
                      const kind = slot.source_type === 'habit' ? 'habit' : 'task';
                      const c    = blockColor(kind, slot.activity_type);
                      return (
                        <div key={slot.id} className={`cal-block ${slot.status === 'done' ? 'done' : ''}`}
                          style={{ top, height, background: c.bg, borderLeftColor: c.border, color: c.text }}>
                          <div className="cal-block-name">{slot.source_name}</div>
                          <div className="cal-block-time">{slot.suggested_start}–{slot.suggested_end}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="cal-legend">
            {LEGEND.map(({ label, color, bg }) => (
              <div key={label} className="flex flex-center gap-8">
                <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, borderLeft: `2px solid ${color}` }} />
                <span className="text-xs text-dim">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
