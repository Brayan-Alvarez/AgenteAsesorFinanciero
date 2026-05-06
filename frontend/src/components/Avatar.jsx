export default function Avatar({ user, size = 'sm' }) {
  if (!user) return null;
  return (
    <span
      className={`avatar${size === 'lg' ? ' lg' : ''}`}
      style={{ background: user.color }}
    >
      {user.avatar}
    </span>
  );
}
