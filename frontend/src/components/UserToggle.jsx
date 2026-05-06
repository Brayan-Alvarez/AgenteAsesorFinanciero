import { USERS } from '../data/categories.js';
import Avatar from './Avatar.jsx';

export default function UserToggle({ value, onChange }) {
  const opts = [
    { id: 'all',     label: 'Conjunto' },
    { id: 'belmont', label: 'Belmont'  },
    { id: 'sofi',    label: 'Sofi'     },
  ];

  return (
    <div className="seg">
      {opts.map(o => {
        const user = USERS.find(u => u.id === o.id);
        return (
          <button
            key={o.id}
            className={value === o.id ? 'active' : ''}
            onClick={() => onChange(o.id)}
          >
            {o.id === 'all' ? (
              <span style={{ display: 'inline-flex' }}>
                <Avatar user={USERS[0]} />
                <span style={{ marginLeft: -6 }}><Avatar user={USERS[1]} /></span>
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
