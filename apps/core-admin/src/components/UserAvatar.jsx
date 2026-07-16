import { Avatar } from 'antd';
import { getAvatarColor, getAvatarInitials, normalizeAvatarText } from '../utils/avatarPresentation';

export default function UserAvatar({ seed, label, style, ...props }) {
  const displayText = normalizeAvatarText(label || seed);
  return (
    <Avatar
      {...props}
      aria-label={displayText}
      style={{
        color: '#fff',
        fontWeight: 700,
        backgroundColor: getAvatarColor(seed || displayText),
        ...style,
      }}
    >
      {getAvatarInitials(displayText)}
    </Avatar>
  );
}
