import { useAppContext } from '../context/AppContext.jsx';
import Avatar from './Avatar.jsx';

export default function UserToggle({ value, onChange }) {
  const { users } = useAppContext();

  // Build options: "Conjunto" first, then one per user
  const opts = [
    { id: 'all', label: 'Conjunto' },
    ...users.map(u => ({ id: u.id, label: u.name })),
  ];

  return (
    <div className="seg">
      {opts.map(o => {
        const user = users.find(u => u.id === o.id);
        return (
          <button
            key={o.id}
            className={value === o.id ? 'active' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.id === 'all' ? (
              <span style={{ display: 'inline-flex' }}>
                {users.slice(0, 2).map((u, i) => (
                  <span key={u.id} style={{ marginLeft: i > 0 ? -6 : 0 }}>
                    <Avatar user={u} />
                  </span>
                ))}
              </span>
            ) : (
              <Avatar user={user} />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
