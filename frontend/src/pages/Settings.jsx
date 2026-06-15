import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Toggle } from '../components/Shared';

export default function Settings() {
  const [settings, setSettings] = useState({ weekend_enabled: 'false' });
  const [saved, setSaved]       = useState(false);

  const [msStatus,      setMsStatus]      = useState(null);
  const [importDays,    setImportDays]    = useState(30);
  const [importing,     setImporting]     = useState(false);
  const [importResult,  setImportResult]  = useState(null);
  const [tgConfigured,  setTgConfigured]  = useState(null);

  // Tags state
  const [tags,       setTags]       = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor,setNewTagColor]= useState('#7c6fff');
  const [tagError,   setTagError]   = useState('');
  const [editingTag, setEditingTag] = useState(null); // {id, name, color}

  useEffect(() => {
    api.settings.get().then(setSettings);
    api.tags.list().then(setTags).catch(() => {});

    const params   = new URLSearchParams(window.location.search);
    const msParam  = params.get('ms');
    if (msParam) window.history.replaceState(null, '', '/settings');

    api.ms.status()
      .then(s => setMsStatus(msParam === 'error' ? { ...s, error: true } : s))
      .catch(() => setMsStatus({ connected: false }));

    api.telegram.status()
      .then(s => setTgConfigured(s.configured))
      .catch(() => setTgConfigured(false));
  }, []);

  const update = async (key, value) => {
    const next = { ...settings, [key]: String(value) };
    setSettings(next);
    await api.settings.update({ [key]: String(value) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Tags handlers
  const addTag = async () => {
    const name = newTagName.trim();
    if (!name) { setTagError('Digite um nome para a tag.'); return; }
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      setTagError('Já existe uma tag com esse nome.'); return;
    }
    try {
      const { id } = await api.tags.create({ name, color: newTagColor });
      setTags(prev => [...prev, { id, name, color: newTagColor }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName('');
      setNewTagColor('#7c6fff');
      setTagError('');
    } catch {
      setTagError('Erro ao criar tag.');
    }
  };

  const deleteTag = async (id) => {
    await api.tags.delete(id);
    setTags(prev => prev.filter(t => t.id !== id));
  };

  const saveEditTag = async () => {
    if (!editingTag) return;
    const name = editingTag.name.trim();
    if (!name) return;
    await api.tags.update(editingTag.id, { name, color: editingTag.color });
    setTags(prev => prev.map(t => t.id === editingTag.id ? { ...t, name, color: editingTag.color } : t));
    setEditingTag(null);
  };

  const handleConnect = async () => {
    try {
      const { url } = await api.ms.authUrl();
      window.location.href = url;
    } catch {
      alert('Microsoft não configurado.\nCopie backend/.env.example para backend/.env e preencha MS_CLIENT_ID e MS_CLIENT_SECRET.');
    }
  };

  const handleDisconnect = async () => {
    await api.ms.disconnect();
    setMsStatus({ connected: false });
    setImportResult(null);
  };

  const handleImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.ms.import(importDays);
      setImportResult(result);
    } catch (e) {
      setImportResult({ error: e.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Configurações</h2>
        <p className="text-muted">Preferências gerais do sistema</p>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>

        {/* ── Fim de semana ── */}
        <p className="section-title">Fim de semana</p>
        <div className="card-sm flex-between" style={{ marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 500 }}>Permitir tarefas no fim de semana</div>
            <div className="text-xs text-dim mt-4">
              Quando ativado, tarefas com "fim de semana permitido" serão sugeridas no sábado e domingo
            </div>
          </div>
          <Toggle
            value={settings.weekend_enabled === 'true'}
            onChange={v => update('weekend_enabled', v)}
          />
        </div>

        <div className="divider" />

        {/* ── Tags ── */}
        <p className="section-title">Tags</p>
        <div className="text-xs text-dim" style={{ marginBottom: 12 }}>
          Use o formato <code style={{ background: 'var(--bg4)', padding: '1px 5px', borderRadius: 4 }}>["Nome"]</code> no título ao criar registros pelo bot para atribuir automaticamente uma tag.
        </div>

        {/* Lista de tags existentes */}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {tags.map(tag => (
              <div key={tag.id}>
                {editingTag?.id === tag.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, padding: '4px 8px' }}>
                    <input
                      value={editingTag.name}
                      onChange={e => setEditingTag(et => ({ ...et, name: e.target.value }))}
                      style={{ width: 90, padding: '2px 6px', fontSize: 12 }}
                      onKeyDown={e => e.key === 'Enter' && saveEditTag()}
                      autoFocus
                    />
                    <input
                      type="color"
                      value={editingTag.color}
                      onChange={e => setEditingTag(et => ({ ...et, color: e.target.value }))}
                      style={{ width: 24, height: 24, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                    />
                    <button className="btn btn-primary btn-sm" onClick={saveEditTag} style={{ padding: '2px 8px', fontSize: 11 }}>✓</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditingTag(null)} style={{ padding: '2px 6px', fontSize: 11 }}>✕</button>
                  </div>
                ) : (
                  <div
                    className="tag-chip"
                    style={{
                      background: tag.color + '22',
                      border: `1px solid ${tag.color}66`,
                      color: tag.color,
                    }}
                  >
                    <span
                      className="tag-chip-label"
                      onClick={() => setEditingTag({ id: tag.id, name: tag.name, color: tag.color })}
                      title="Clique para editar"
                    >
                      <span style={{ opacity: 0.6 }}>["</span>{tag.name}<span style={{ opacity: 0.6 }}>"]</span>
                    </span>
                    <button className="tag-chip-del" onClick={() => deleteTag(tag.id)} title="Remover tag">×</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Formulário de nova tag */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={newTagName}
            onChange={e => { setNewTagName(e.target.value); setTagError(''); }}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder='Nome da tag (ex: Trabalho)'
            style={{ flex: 1, maxWidth: 220 }}
          />
          <div style={{ position: 'relative' }} title="Escolher cor">
            <input
              type="color"
              value={newTagColor}
              onChange={e => setNewTagColor(e.target.value)}
              style={{
                width: 36, height: 36,
                border: '1px solid var(--border2)',
                borderRadius: 8,
                padding: 3,
                cursor: 'pointer',
                background: 'var(--bg3)',
              }}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={addTag}>+ Adicionar</button>
        </div>
        {tagError && <div className="text-xs" style={{ color: 'var(--red)', marginTop: 6 }}>{tagError}</div>}

        <div className="divider" />

        {/* ── Microsoft 365 ── */}
        <p className="section-title">Microsoft 365 / Teams</p>

        {msStatus === null ? (
          <div className="text-xs text-dim">Verificando conexão...</div>

        ) : !msStatus.connected ? (
          <div className="card-sm flex-between" style={{ gap: 16 }}>
            <div>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Calendário do Teams</div>
              <div className="text-xs text-dim">
                Importe eventos do Outlook/Teams diretamente para o Rotina
              </div>
              {msStatus.error && (
                <span className="badge badge-red" style={{ marginTop: 8, display: 'inline-flex' }}>
                  Falha ao autenticar. Tente novamente.
                </span>
              )}
            </div>
            <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={handleConnect}>
              Conectar Microsoft
            </button>
          </div>

        ) : (
          <>
            <div className="card-sm flex-between" style={{ marginBottom: 8 }}>
              <div>
                <div className="flex flex-center gap-8" style={{ marginBottom: 4 }}>
                  <span className="badge badge-green">✓ Conectado</span>
                  {msStatus.name && <span style={{ fontWeight: 500 }}>{msStatus.name}</span>}
                </div>
                {msStatus.email && (
                  <div className="text-xs text-dim">{msStatus.email}</div>
                )}
              </div>
              <button className="btn btn-danger btn-sm" onClick={handleDisconnect}>
                Desconectar
              </button>
            </div>

            <div className="card-sm">
              <div style={{ fontWeight: 500, marginBottom: 10 }}>Importar eventos do calendário</div>
              <div className="flex flex-center gap-8">
                <select
                  value={importDays}
                  onChange={e => setImportDays(Number(e.target.value))}
                  style={{ flex: 1 }}
                >
                  <option value={7}>Próximos 7 dias</option>
                  <option value={14}>Próximos 14 dias</option>
                  <option value={30}>Próximos 30 dias</option>
                  <option value={60}>Próximos 60 dias</option>
                  <option value={90}>Próximos 90 dias</option>
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleImport}
                  disabled={importing}
                  style={{ flexShrink: 0 }}
                >
                  {importing ? 'Importando...' : 'Importar'}
                </button>
              </div>
              {importResult && (
                <div className="mt-8">
                  {importResult.error ? (
                    <span className="badge badge-red">{importResult.error}</span>
                  ) : (
                    <span className="badge badge-green">
                      {importResult.imported} importados · {importResult.skipped} já existentes
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <div className="divider" />

        {/* ── Telegram ── */}
        <p className="section-title">Bot Telegram</p>
        {tgConfigured === null ? (
          <div className="text-xs text-dim">Verificando...</div>
        ) : tgConfigured ? (
          <div className="card-sm flex-between" style={{ gap: 12 }}>
            <div>
              <div className="flex flex-center gap-8" style={{ marginBottom: 4 }}>
                <span className="badge badge-green">✓ Configurado</span>
              </div>
              <div className="text-xs text-dim">
                Execute <code style={{ background: 'var(--bg4)', padding: '1px 5px', borderRadius: 4 }}>python telegram_bot.py</code> na pasta <code style={{ background: 'var(--bg4)', padding: '1px 5px', borderRadius: 4 }}>backend/</code> para iniciar o bot.
              </div>
            </div>
          </div>
        ) : (
          <div className="card-sm" style={{ background: 'rgba(124,111,255,0.05)', borderColor: 'rgba(124,111,255,0.2)' }}>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>Como configurar</div>
            <ol style={{ paddingLeft: 16, color: 'var(--text2)', fontSize: 12, lineHeight: 2 }}>
              <li>Converse com <strong>@BotFather</strong> no Telegram e envie <code>/newbot</code></li>
              <li>Copie o token gerado</li>
              <li>Copie <code>backend/.env.example</code> para <code>backend/.env</code></li>
              <li>Cole o token em <code>TELEGRAM_BOT_TOKEN</code></li>
              <li>Execute: <code>python telegram_bot.py</code></li>
            </ol>
            <div className="text-xs text-dim" style={{ marginTop: 8 }}>
              Comandos disponíveis: /tarefas, /tarefa, /eventos, /evento, /habitos, /habito, /blocos, /bloco, /hoje, /ajuda
            </div>
          </div>
        )}

        {saved && (
          <div className="badge badge-green" style={{ marginTop: 16, padding: '6px 12px' }}>
            ✓ Salvo
          </div>
        )}
      </div>
    </div>
  );
}
