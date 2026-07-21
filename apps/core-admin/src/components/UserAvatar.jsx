import { Avatar } from 'antd';
import {
  getAvatarColor,
  getAvatarInitials,
  getCartoonAvatarDataUri,
  normalizeAvatarText,
} from '../utils/avatarPresentation';

export default function UserAvatar({ seed, label, avatarUrl, style, ...props }) {
  const displayText = normalizeAvatarText(label || seed);
  const generatedAvatar = getCartoonAvatarDataUri(seed || displayText);
  const imageSource = String(avatarUrl || '').trim() || generatedAvatar;

  const handleImageError = (event) => {
    const image = event.currentTarget;
    if (image.dataset.fallbackApplied !== 'true') {
      image.dataset.fallbackApplied = 'true';
      image.src = generatedAvatar;
    }
  };

  return (
    <Avatar
      {...props}
      aria-label={displayText}
      src={(
        <img
          src={imageSource}
          alt=""
          aria-hidden="true"
          draggable="false"
          onError={handleImageError}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
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
