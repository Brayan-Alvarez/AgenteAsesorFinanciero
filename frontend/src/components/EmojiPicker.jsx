import { useEffect, useRef, useState } from 'react';

const EMOJI_GROUPS = [
  { label: 'Hogar',       items: ['🏠','🛋️','💡','🔧','🏡','🪴','🛁','🔑','🚪','🪞'] },
  { label: 'Comida',      items: ['🛒','🍽️','🥩','🥗','🍕','☕','🍺','🥑','🍰','🥦'] },
  { label: 'Transporte',  items: ['🚌','🚗','🏍️','🚕','✈️','🚲','⛽','🅿️','🛵','🛻'] },
  { label: 'Dinero',      items: ['💰','💳','💵','🏦','📈','💸','🪙','💎','📊','🏧'] },
  { label: 'Salud',       items: ['🏥','💊','🩺','🏋️','🧘','👓','🦷','🩹','💆','🧬'] },
  { label: 'Ocio',        items: ['🎉','🎮','🎬','🎵','🐾','🎁','📚','🎭','🏖️','⚽'] },
  { label: 'Tech',        items: ['💻','📱','⌨️','🖥️','🎧','📡','🔌','🖨️','📷','🎙️'] },
  { label: 'Varios',      items: ['📦','⭐','🔔','📋','🏷️','🎓','👗','💄','🌙','✨'] },
];

export default function EmojiPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Elegir emoji"
        style={{
          fontSize: 22, width: 44, height: 44, borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-2)',
          cursor: 'pointer', display: 'grid', placeItems: 'center',
          transition: 'border-color 0.15s',
        }}
      >
        {value || '📦'}
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 400, top: 'calc(100% + 6px)', left: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          padding: '10px 12px', width: 268,
        }}>
          {EMOJI_GROUPS.map(group => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <div style={{
                fontSize: 10, color: 'var(--text-mute)',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                marginBottom: 4, paddingLeft: 2,
              }}>
                {group.label}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2 }}>
                {group.items.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { onChange(emoji); setOpen(false); }}
                    title={emoji}
                    style={{
                      fontSize: 18, padding: '3px 2px', border: 'none', cursor: 'pointer',
                      borderRadius: 6, lineHeight: 1, background: 'transparent',
                      outline: emoji === value ? '2px solid var(--primary)' : 'none',
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
