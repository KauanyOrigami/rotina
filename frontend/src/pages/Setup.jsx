import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Modal, Toggle, CheckboxDays, EmptyState } from '../components/Shared';

const DAY_NAMES = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ACTIVITY_TYPES = [
  { value: 'exercise', label: '🏋️ Exercício' },
  { value: 'reading',  label: '📖 Leitura' },
  { value: 'study',    label: '📚 Estudo' },
  { value: 'leisure',  label: '🎮 Lazer' },
  { value: 'rest',     label: '😴 Descanso' },
];

// ── Stress Levels ──────────────────────────────────────────
function StressSection() {
  const [levels, setLevels] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ label: '', weight: 3, color: '#888888' });
  const [saving, setSaving] = useState(false);

  const load = async () => setLevels(await api.stressLevels.list());
  useEffect(() => { load(); }, []);

  const openNew  = () => { setForm({ label: '', weight: 3, color: '#7c6fff' }); setModal('new'); };
  const openEdit = (l) => { setForm({ label: l.label, weight: l.weight, color: l.color }); setModal(l); };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'new') await api.stressLevels.create(form);
      else await api.stressLevels.update(modal.id, form);
      setModal(null); load();
    } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Remover nível?')) return;
    await api.stressLevels.delete(id); load();
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <div className="flex-between mb-16">
        <div>
          <p className="section-title" style={{ marginBottom: 0 }}>Níveis de carga cognitiva</p>
          <p className="text-xs text-dim mt-4">Defina etiquetas para classificar o cansaço mental de cada evento</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={openNew}>+ Novo nível</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {levels.map(l => (
          <div key={l.id} className="card-sm flex-between">
            <div className="flex flex-center gap-12">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 500 }}>{l.label}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i < l.weight ? l.color : 'var(--border2)' }} />
                ))}
              </div>
            </div>
            <div className="flex flex-center gap-6">
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(l)}>Editar</button>
              <button className="btn btn-danger btn-sm" onClick={() => del(l.id)}>×</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo nível' : 'Editar nível'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Nome</label>
            <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="Ex: Reuniões pesadas" autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Peso (1–5)</label>
              <input type="number" min="1" max="5" value={form.weight} onChange={e => set('weight', parseInt(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Cor</label>
              <input type="color" value={form.color} onChange={e => set('color', e.target.value)} style={{ height: 38, cursor: 'pointer' }} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Fixed Blocks ───────────────────────────────────────────
function FixedBlocksSection() {
  const [blocks, setBlocks] = useState([]);
  const [levels, setLevels] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ label: '', day_of_week: 1, start_time: '08:00', end_time: '12:00', stress_level_id: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [b, l] = await Promise.all([api.fixedBlocks.list(), api.stressLevels.list()]);
    setBlocks(b); setLevels(l);
  };
  useEffect(() => { load(); }, []);

  const openNew  = () => { setForm({ label: '', day_of_week: 1, start_time: '08:00', end_time: '12:00', stress_level_id: levels[0]?.id || '' }); setModal('new'); };
  const openEdit = (b) => { setForm({ label: b.label, day_of_week: b.day_of_week, start_time: b.start_time, end_time: b.end_time, stress_level_id: b.stress_level_id || '' }); setModal(b); };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'new') await api.fixedBlocks.create(form);
      else await api.fixedBlocks.update(modal.id, { ...form, is_active: modal.is_active });
      setModal(null); load();
    } finally { setSaving(false); }
  };

  const del = async (id) => { if (!window.confirm('Remover bloco?')) return; await api.fixedBlocks.delete(id); load(); };
  const toggle = async (block) => { await api.fixedBlocks.update(block.id, { ...block, is_active: block.is_active ? 0 : 1 }); load(); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const byDay = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    blocks: blocks.filter(b => b.day_of_week === i)
  }));

  return (
    <>
      <div className="flex-between mb-16">
        <div>
          <p className="section-title" style={{ marginBottom: 0 }}>Blocos fixos semanais</p>
          <p className="text-xs text-dim mt-4">Aulas e trabalho — o sistema não agendará nada nestes horários</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={openNew}>+ Novo bloco</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {byDay.filter(d => d.blocks.length > 0).map(({ day, blocks }) => (
          <div key={day}>
            <div className="text-xs text-dim" style={{ marginBottom: 4, fontWeight: 600 }}>{DAY_NAMES[day]}</div>
            {blocks.map(block => (
              <div key={block.id} className="card-sm flex-between" style={{ marginBottom: 4, opacity: block.is_active ? 1 : 0.4 }}>
                <div className="flex flex-center gap-12">
                  {block.stress_color && <div style={{ width: 8, height: 8, borderRadius: '50%', background: block.stress_color }} />}
                  <span style={{ fontWeight: 500 }}>{block.label}</span>
                  <span className="font-mono text-xs text-dim">{block.start_time}–{block.end_time}</span>
                  {block.stress_label && <span className="badge badge-gray">{block.stress_label}</span>}
                </div>
                <div className="flex flex-center gap-6">
                  <Toggle value={Boolean(block.is_active)} onChange={() => toggle(block)} />
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(block)}>Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => del(block.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {blocks.length === 0 && (
          <EmptyState icon="📅" message="Nenhum bloco fixo. Adicione suas aulas e horários de trabalho." />
        )}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo bloco fixo' : 'Editar bloco'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Nome</label>
            <input value={form.label} onChange={e => set('label', e.target.value)} placeholder="Ex: Aula de cálculo, Trabalho" autoFocus />
          </div>
          <div className="form-group">
            <label>Dia da semana</label>
            <select value={form.day_of_week} onChange={e => set('day_of_week', parseInt(e.target.value))}>
              {DAY_NAMES.map((d,i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Início</label>
              <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
            </div>
            <div className="form-group">
              <label>Fim</label>
              <input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Nível de carga cognitiva</label>
            <select value={form.stress_level_id} onChange={e => set('stress_level_id', e.target.value)}>
              <option value="">Sem classificação</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.label} (peso {l.weight})</option>)}
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Habits ─────────────────────────────────────────────────
function HabitsSection() {
  const [habits, setHabits] = useState([]);
  const [levels, setLevels] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', activity_type: 'exercise', duration_minutes: 60, preferred_time: '', days_of_week: [1,2,3,4,5], max_stress_weight: 3 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [h, l] = await Promise.all([api.habits.list(), api.stressLevels.list()]);
    setHabits(h); setLevels(l);
  };
  useEffect(() => { load(); }, []);

  const openNew  = () => { setForm({ name: '', activity_type: 'exercise', duration_minutes: 60, preferred_time: '', days_of_week: [1,2,3,4,5], max_stress_weight: 3 }); setModal('new'); };
  const openEdit = (h) => { setForm({ name: h.name, activity_type: h.activity_type, duration_minutes: h.duration_minutes, preferred_time: h.preferred_time || '', days_of_week: h.days_of_week, max_stress_weight: h.max_stress_weight }); setModal(h); };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'new') await api.habits.create(form);
      else await api.habits.update(modal.id, { ...form, is_active: modal.is_active });
      setModal(null); load();
    } finally { setSaving(false); }
  };

  const del = async (id) => { if (!window.confirm('Remover hábito?')) return; await api.habits.delete(id); load(); };
  const toggle = async (h) => { await api.habits.update(h.id, { ...h, days_of_week: h.days_of_week, is_active: h.is_active ? 0 : 1 }); load(); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const stressLabel = (w) => levels.find(l => l.weight >= w)?.label || `peso ${w}`;

  return (
    <>
      <div className="flex-between mb-16">
        <div>
          <p className="section-title" style={{ marginBottom: 0 }}>Hábitos recorrentes</p>
          <p className="text-xs text-dim mt-4">Academia, leitura, estudo — o sistema sugere nos dias e horários certos</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={openNew}>+ Novo hábito</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {habits.map(h => (
          <div key={h.id} className="card-sm flex-between" style={{ opacity: h.is_active ? 1 : 0.4 }}>
            <div style={{ flex: 1 }}>
              <div className="flex flex-center gap-8">
                <span style={{ fontWeight: 500 }}>
                  {ACTIVITY_TYPES.find(a => a.value === h.activity_type)?.label?.split(' ')[0]} {h.name}
                </span>
                <span className="badge badge-gray">{h.duration_minutes}min</span>
                {h.preferred_time && <span className="font-mono text-xs text-dim">{h.preferred_time}</span>}
              </div>
              <div className="flex flex-center gap-6 mt-4">
                {h.days_of_week.map(d => (
                  <span key={d} className="text-xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>{DAY_NAMES[d]}</span>
                ))}
                <span className="text-xs text-dim">· até carga {h.max_stress_weight}</span>
              </div>
            </div>
            <div className="flex flex-center gap-6">
              <Toggle value={Boolean(h.is_active)} onChange={() => toggle(h)} />
              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(h)}>Editar</button>
              <button className="btn btn-danger btn-sm" onClick={() => del(h.id)}>×</button>
            </div>
          </div>
        ))}
        {habits.length === 0 && (
          <EmptyState icon="🔄" message="Nenhum hábito configurado. Adicione academia, leitura ou estudo." />
        )}
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo hábito' : 'Editar hábito'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Nome</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex: Academia, Leitura noturna" autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo de atividade</label>
              <select value={form.activity_type} onChange={e => set('activity_type', e.target.value)}>
                {ACTIVITY_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Duração (minutos)</label>
              <input type="number" min="15" step="15" value={form.duration_minutes} onChange={e => set('duration_minutes', parseInt(e.target.value))} />
            </div>
          </div>
          <div className="form-group">
            <label>Horário preferido (opcional)</label>
            <input type="time" value={form.preferred_time} onChange={e => set('preferred_time', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Dias da semana</label>
            <CheckboxDays value={form.days_of_week} onChange={v => set('days_of_week', v)} />
          </div>
          <div className="form-group">
            <label>Não sugerir se carga cognitiva do dia for maior que</label>
            <select value={form.max_stress_weight} onChange={e => set('max_stress_weight', parseInt(e.target.value))}>
              {[1,2,3,4,5].map(w => <option key={w} value={w}>Peso {w} — {['Muito leve','Leve','Moderado','Pesado','Muito pesado'][w-1]}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Main Setup Page ────────────────────────────────────────
export default function Setup() {
  const [tab, setTab] = useState('blocks');
  const tabs = [
    { id: 'blocks', label: '📅 Blocos fixos' },
    { id: 'habits', label: '🔄 Hábitos' },
    { id: 'stress', label: '🧠 Níveis de carga' },
  ];

  return (
    <div>
      <div className="page-header">
        <h2>Configuração</h2>
        <p className="text-muted">Configure sua base: blocos fixos, hábitos e classificações de carga</p>
      </div>

      <div className="flex flex-center gap-8 mb-16">
        {tabs.map(t => (
          <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {tab === 'blocks' && <FixedBlocksSection />}
        {tab === 'habits' && <HabitsSection />}
        {tab === 'stress' && <StressSection />}
      </div>
    </div>
  );
}
