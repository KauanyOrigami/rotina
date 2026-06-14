import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { StressBar } from '../components/Shared';

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function getWeekStart(date) {
  return startOfWeek(date, { weekStartsOn: 0 });
}

export default function Week() {
  const [weekData, setWeekData] = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = getWeekStart(currentDate);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const start = format(weekStart, 'yyyy-MM-dd');
        const [data, allTasks] = await Promise.all([
          api.weekPlan.get(start),
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
  }, [weekStart.toISOString()]);

  const prevWeek = () => setCurrentDate(d => addDays(d, -7));
  const nextWeek = () => setCurrentDate(d => addDays(d, 7));
  const goToday  = () => setCurrentDate(new Date());

  const today = new Date();

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h2>Semana</h2>
            <p className="text-muted">
              {format(weekStart, "d 'de' MMM", { locale: ptBR })} –{' '}
              {format(addDays(weekStart, 6), "d 'de' MMM", { locale: ptBR })}
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
        <div className="text-muted">Carregando semana...</div>
      ) : (
        <div className="week-grid">
          {weekData.map((day) => {
            const date = new Date(day.date + 'T12:00:00');
            const isToday = isSameDay(date, today);
            const confirmedSlots = (day.slots || []).filter(s => ['confirmed', 'done'].includes(s.status));
            const dayEvents = events
              .filter(e => e.event_date === day.date)
              .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

            const isEmpty =
              (day.fixedBlocks || []).length === 0 &&
              confirmedSlots.length === 0 &&
              dayEvents.length === 0;

            return (
              <div key={day.date} className="day-col">
                <div className={`day-col-header ${isToday ? 'today' : ''}`}>
                  <div>{DAY_SHORT[day.dayOfWeek]}</div>
                  <div className={`day-col-date ${isToday ? 'today' : ''}`}>
                    {format(date, 'd')}
                  </div>
                  {day.plan && (
                    <div style={{ marginTop: 4 }}>
                      <StressBar weight={day.plan.overall_stress_weight} />
                    </div>
                  )}
                </div>

                {/* Blocos fixos */}
                {(day.fixedBlocks || []).map(block => (
                  <div key={block.id} className="week-block week-block-fixed">
                    <div>{block.label}</div>
                    <div style={{ opacity: 0.7, fontSize: 9 }}>{block.start_time}–{block.end_time}</div>
                  </div>
                ))}

                {/* Eventos */}
                {dayEvents.map(event => (
                  <div key={event.id} className="week-block week-block-event">
                    <div>{event.title}</div>
                    {event.start_time && (
                      <div style={{ opacity: 0.7, fontSize: 9 }}>
                        {event.start_time}{event.end_time ? `–${event.end_time}` : ''}
                      </div>
                    )}
                  </div>
                ))}

                {/* Slots agendados (hábitos e tarefas alocadas) */}
                {confirmedSlots.map(slot => (
                  <div
                    key={slot.id}
                    className={`week-block ${slot.source_type === 'habit' ? 'week-block-habit' : 'week-block-task'} ${slot.status === 'done' ? 'week-block-done' : ''}`}
                  >
                    <div>{slot.source_name}</div>
                    <div style={{ opacity: 0.7, fontSize: 9 }}>{slot.suggested_start}–{slot.suggested_end}</div>
                  </div>
                ))}

                {isToday && isEmpty && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', padding: '6px 0' }}>livre</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legenda */}
      <div className="flex flex-center gap-16" style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <div className="flex flex-center gap-8">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(96,165,250,0.3)', borderLeft: '2px solid var(--blue)' }} />
          <span className="text-xs text-dim">Bloco fixo</span>
        </div>
        <div className="flex flex-center gap-8">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(124,111,255,0.2)', borderLeft: '2px solid var(--accent)' }} />
          <span className="text-xs text-dim">Evento</span>
        </div>
        <div className="flex flex-center gap-8">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(52,211,153,0.2)', borderLeft: '2px solid var(--green)' }} />
          <span className="text-xs text-dim">Hábito</span>
        </div>
        <div className="flex flex-center gap-8">
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(251,191,36,0.2)', borderLeft: '2px solid var(--amber)' }} />
          <span className="text-xs text-dim">Tarefa alocada</span>
        </div>
      </div>
    </div>
  );
}
