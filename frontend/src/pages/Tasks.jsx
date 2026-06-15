import React, { useState, useEffect } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { api } from '../lib/api';
import { Modal, Toggle, EmptyState, EffortBadge } from '../components/Shared';

const TYPES = [
  { value: 'academic', label: 'Faculdade' },
  { value: 'work',     label: 'Trabalho' },
  { value: 'personal', label: 'Pessoal' },
  { value: 'other',    label: 'Outro' },
];
const EFFORTS = [
  { value: 'low',    label: 'Leve (fácil, não requer foco intenso)' },
  { value: 'medium', label: 'Médio (requer atenção moderada)' },
  { value: 'high',   label: 'Intenso (requer foco total)' },
];

const empty = () => ({
  title: '', type: 'academic', effort: 'medium',
  estimated_minutes: 60, due_date: '', allow_split: false,
  allow_weekend: false, notes: '', tag_id: null,
  is_event: false, event_date: '', start_time: '', end_time: '',
});

function DueBadge({ dueDate }) {
  if (!dueDate) return null;
  const days = differenceInDays(parseISO(dueDate), new Date());
  if (days < 0)   return <span className="badge badge-red">Atrasada</span>;
  if (days === 0)  return <span className="badge badge-red">Hoje</span>;
  if (days === 1)  return <span className="badge badge-amber">Amanhã</span>;
  if (days <= 3)   return <span className="badge badge-amber">{days} dias</span>;
  return <span className="badge badge-gray">{format(parseISO(dueDate), "d MMM", { locale: ptBR })}</span>;
}

function TagChip({ name, color }) {
  if (!name) return null;
  const c = color || '#7c6fff';
  return (
    <span style={{
      fontSize: 10, fontFamily: "'DM Mono', monospace",
      padding: '2px 7px', borderRadius: 10,
      background: c + '22', border: `1px solid ${c}55`, color: c,
    }}>
      {name}
    </span>
  );
}

function TaskCard({ task, onEdit, onDelete, onStatusChange, kanban, onDragStart }) {
  const isEvento = Boolean(task.is_event);
  return (
    <div
      className="card-sm"
      style={{ marginBottom: 8, cursor: kanban ? 'default' : 'grab' }}
      draggable={!kanban}
      onDragStart={!kanban ? onDragStart : undefined}
    >
      <div className="flex-between" style={{ gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex flex-center gap-8" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 500, fontSize: 14 }}>{task.title}</span>
            {isEvento && task.event_date
              ? <span className="badge badge-blue">{format(parseISO(task.event_date), "d MMM", { locale: ptBR })}{task.start_time ? ` ${task.start_time}` : ''}</span>
              : <DueBadge dueDate={task.due_date} />
            }
            <TagChip name={task.tag_name} color={task.tag_color} />
          </div>
          <div className="flex flex-center gap-8 mt-4" style={{ flexWrap: 'wrap' }}>
            <span className="text-xs text-dim">
              {TYPES.find(t => t.value === task.type)?.label}
            </span>
            <EffortBadge effort={task.effort} />
            {!isEvento && <span className="text-xs text-dim font-mono">{task.estimated_minutes}min</span>}
            {isEvento && task.start_time && task.end_time && (
              <span className="text-xs text-dim font-mono">{task.start_time}–{task.end_time}</span>
            )}
            {task.allow_split  ? <span className="badge badge-gray">divisível</span> : null}
            {task.allow_weekend ? <span className="badge badge-gray">fim de semana</span> : null}
            {task.notes && <span className="text-xs text-dim">📝</span>}
          </div>
        </div>
        <div className="flex flex-center" style={{ gap: 6, flexShrink: 0 }}>
          {kanban && task.status === 'pending' && (
            <button className="btn btn-ghost btn-sm" title="Iniciar" onClick={() => onStatusChange(task, 'in_progress')}>▶</button>
          )}
          {task.status !== 'done' && (
            <button className="btn btn-success btn-sm" onClick={() => onStatusChange(task, 'done')}>✓</button>
          )}
          {kanban && task.status === 'done' && (
            <button className="btn btn-ghost btn-sm" title="Reabrir" onClick={() => onStatusChange(task, 'pending')}>↩</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(task)}>Editar</button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(task.id)}>×</button>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ title, status, tasks, onEdit, onDelete, onStatusChange, onNew }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: 16,
    }}>
      <div className="flex-between" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </span>
        <div className="flex flex-center" style={{ gap: 6 }}>
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{tasks.length}</span>
          {status === 'pending' && (
            <button className="btn btn-ghost btn-sm" onClick={onNew} style={{ padding: '2px 8px' }}>+</button>
          )}
        </div>
      </div>
      {tasks.length === 0 ? (
        <div className="text-xs text-dim" style={{ padding: '16px 0', textAlign: 'center' }}>Sem tarefas</div>
      ) : (
        tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            kanban
          />
        ))
      )}
    </div>
  );
}

export default function Tasks() {
  const [tasks,   setTasks]   = useState([]);
  const [tags,    setTags]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('pending');
  const [view,    setView]    = useState('list');
  const [modal,   setModal]   = useState(null);
  const [form,    setForm]    = useState(empty());
  const [saving,  setSaving]  = useState(false);
  const [dragOver, setDragOver] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, tagData] = await Promise.all([
        api.tasks.list({}),
        api.tags.list(),
      ]);
      setTasks(data);
      setTags(tagData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew      = () => { setForm(empty()); setModal('new'); };
  const openNewEvent = () => { setForm({ ...empty(), is_event: true }); setModal('new'); };
  const openEdit = (task) => {
    setForm({
      title: task.title, type: task.type, effort: task.effort,
      estimated_minutes: task.estimated_minutes,
      due_date: task.due_date || '',
      allow_split: Boolean(task.allow_split),
      allow_weekend: Boolean(task.allow_weekend),
      notes: task.notes || '',
      tag_id: task.tag_id || null,
      is_event: Boolean(task.is_event),
      event_date: task.event_date || '',
      start_time: task.start_time || '',
      end_time: task.end_time || '',
    });
    setModal(task);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (modal === 'new') {
        await api.tasks.create(form);
      } else {
        await api.tasks.update(modal.id, { ...form, status: modal.status });
      }
      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remover esta tarefa?')) return;
    await api.tasks.delete(id);
    load();
  };

  const handleStatusChange = async (task, newStatus) => {
    await api.tasks.update(task.id, {
      ...task,
      status: newStatus,
      allow_split: Boolean(task.allow_split),
      allow_weekend: Boolean(task.allow_weekend),
    });
    load();
  };

  const handleConvert = async (task, newIsEvent) => {
    if (Boolean(task.is_event) === newIsEvent) return;
    await api.tasks.update(task.id, {
      title: task.title,
      type: task.type,
      effort: task.effort,
      estimated_minutes: task.estimated_minutes || 60,
      due_date: task.due_date || null,
      allow_split: Boolean(task.allow_split),
      allow_weekend: Boolean(task.allow_weekend),
      status: task.status,
      notes: task.notes,
      is_event: newIsEvent,
      event_date: task.event_date || null,
      start_time: task.start_time || null,
      end_time: task.end_time || null,
    });
    load();
  };

  const handleDragStart = (e, task) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e, targetIsEvent) => {
    e.preventDefault();
    setDragOver(null);
    const taskId = e.dataTransfer.getData('taskId');
    const task = tasks.find(t => t.id === taskId);
    if (task) handleConvert(task, targetIsEvent);
  };

  const dropZoneStyle = (section) => ({
    borderRadius: 'var(--radius-lg)',
    outline: dragOver === section ? '2px dashed var(--accent)' : '2px dashed transparent',
    outlineOffset: 4,
    transition: 'outline-color 0.15s',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isEvento = form.is_event;

  const filters = [
    { value: 'pending',     label: 'Pendentes' },
    { value: 'in_progress', label: 'Em progresso' },
    { value: 'done',        label: 'Concluídas' },
    { value: 'all',         label: 'Todas' },
  ];

  const regularTasks = tasks.filter(t => !t.is_event);
  const events       = tasks.filter(t => t.is_event).sort((a, b) => {
    if (!a.event_date && !b.event_date) return 0;
    if (!a.event_date) return 1;
    if (!b.event_date) return -1;
    return a.event_date.localeCompare(b.event_date);
  });

  const filteredTasks = filter === 'all'
    ? regularTasks
    : regularTasks.filter(t => t.status === filter);

  const kanbanGroups = {
    pending:     regularTasks.filter(t => t.status === 'pending'),
    in_progress: regularTasks.filter(t => t.status === 'in_progress'),
    done:        regularTasks.filter(t => t.status === 'done'),
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex-between">
          <div>
            <h2>Tarefas</h2>
            <p className="text-muted">Gerencie tarefas pontuais com prazo e esforço estimado</p>
          </div>
          <div className="flex flex-center gap-8">
            <div className="flex flex-center" style={{ background: 'var(--bg3)', borderRadius: 8, padding: 3, border: '1px solid var(--border)', gap: 2 }}>
              <button
                className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 12px' }}
                onClick={() => setView('list')}
              >Lista</button>
              <button
                className={`btn btn-sm ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '4px 12px' }}
                onClick={() => setView('kanban')}
              >Kanban</button>
            </div>
            <button className="btn btn-primary" onClick={openNew}>+ Nova tarefa</button>
          </div>
        </div>
      </div>

      {view === 'list' && (
        <div className="flex flex-center gap-8 mb-16">
          {filters.map(f => (
            <button
              key={f.value}
              className={`btn btn-sm ${filter === f.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.value)}
            >{f.label}</button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-muted">Carregando...</div>
      ) : view === 'list' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'flex-start' }}>
          {/* ── Tarefas ── */}
          <div
            style={dropZoneStyle('tasks')}
            onDragOver={(e) => { e.preventDefault(); setDragOver('tasks'); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
            onDrop={(e) => handleDrop(e, false)}
          >
            <div className="section-title" style={{ marginTop: 0 }}>Tarefas</div>
            {filteredTasks.length === 0 ? (
              <EmptyState
                icon="✅"
                message={filter === 'done' ? 'Nenhuma tarefa concluída ainda.' : 'Nenhuma tarefa pendente.'}
                action={<button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openNew}>+ Nova tarefa</button>}
              />
            ) : (
              filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onDragStart={(e) => handleDragStart(e, task)}
                />
              ))
            )}
          </div>

          {/* ── Eventos ── */}
          <div
            style={dropZoneStyle('events')}
            onDragOver={(e) => { e.preventDefault(); setDragOver('events'); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
            onDrop={(e) => handleDrop(e, true)}
          >
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <span className="section-title" style={{ marginTop: 0, marginBottom: 0 }}>Eventos</span>
              <button className="btn btn-ghost btn-sm" onClick={openNewEvent}>+ Novo evento</button>
            </div>
            {events.length === 0 ? (
              <EmptyState
                icon="📅"
                message="Nenhum evento cadastrado."
                action={<button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={openNewEvent}>+ Novo evento</button>}
              />
            ) : (
              events.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onDragStart={(e) => handleDragStart(e, task)}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <KanbanColumn
            title="A fazer"
            status="pending"
            tasks={kanbanGroups.pending}
            onEdit={openEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
            onNew={openNew}
          />
          <KanbanColumn
            title="Em andamento"
            status="in_progress"
            tasks={kanbanGroups.in_progress}
            onEdit={openEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
          <KanbanColumn
            title="Concluídas"
            status="done"
            tasks={kanbanGroups.done}
            onEdit={openEdit}
            onDelete={handleDelete}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}

      {modal && (
        <Modal
          title={modal === 'new' ? 'Nova tarefa' : 'Editar tarefa'}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={saving}
        >
          <div className="form-group">
            <label>Título *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Entregar trabalho de cálculo" autoFocus />
          </div>

          <div className="form-row" style={{ marginBottom: 16 }}>
            <Toggle value={form.is_event} onChange={v => set('is_event', v)} label="É um evento (tem data e horário fixos)" />
          </div>

          {tags.length > 0 && (
            <div className="form-group">
              <label>Tag</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => set('tag_id', null)}
                  style={{
                    padding: '3px 12px', borderRadius: 20, fontSize: 12,
                    border: '1px solid var(--border2)', cursor: 'pointer',
                    background: !form.tag_id ? 'var(--bg4)' : 'var(--bg3)',
                    color: !form.tag_id ? 'var(--text)' : 'var(--text3)',
                    fontWeight: !form.tag_id ? 500 : 400,
                  }}
                >
                  Nenhuma
                </button>
                {tags.map(tag => {
                  const sel = form.tag_id === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => set('tag_id', sel ? null : tag.id)}
                      style={{
                        padding: '3px 12px', borderRadius: 20, fontSize: 12,
                        fontFamily: "'DM Mono', monospace", cursor: 'pointer',
                        border: `1px solid ${sel ? tag.color + 'aa' : tag.color + '44'}`,
                        background: sel ? tag.color + '28' : tag.color + '0d',
                        color: tag.color,
                        fontWeight: sel ? 600 : 400,
                        transition: 'all 0.15s',
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Esforço cognitivo</label>
              <select value={form.effort} onChange={e => set('effort', e.target.value)}>
                {EFFORTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>

          {isEvento ? (
            <>
              <div className="form-group">
                <label>Data do evento</label>
                <input type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Horário de início</label>
                  <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Horário de fim</label>
                  <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>Tempo estimado (minutos)</label>
                  <input type="number" min="15" step="15" value={form.estimated_minutes} onChange={e => set('estimated_minutes', parseInt(e.target.value))} />
                </div>
                <div className="form-group">
                  <label>Prazo</label>
                  <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <Toggle value={form.allow_split} onChange={v => set('allow_split', v)} label="Pode ser dividida em sessões menores" />
              </div>
              <div className="form-row" style={{ marginBottom: 16 }}>
                <Toggle value={form.allow_weekend} onChange={v => set('allow_weekend', v)} label="Pode ser alocada no fim de semana" />
              </div>
            </>
          )}

          <div className="form-group">
            <label>Notas (opcional)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Contexto adicional..." />
          </div>
        </Modal>
      )}
    </div>
  );
}
