import type { ImageElement } from './types';
import { useMemo } from 'react';
import { imageGeometry } from './imageGeometry';
import { imageDisplaySource } from './imageDimensions';

/** Pictures share one clipped, local-frame rendering path across canvas, thumbnails and presentation. */
export default function ImageView({ element }: { element: ImageElement }) {
  const geometry = imageGeometry(element);
  const src = useMemo(
    () => (element.orientation === 'encoded' ? imageDisplaySource(element.src) : element.src),
    [element.src, element.orientation],
  );
  const flipped = element.flipH || element.flipV;
  return (
    <div
      className="picture-frame"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      <div
        className="picture-orientation"
        style={{
          position: 'absolute',
          inset: 0,
          transform: flipped
            ? `scale(${element.flipH ? -1 : 1}, ${element.flipV ? -1 : 1})`
            : undefined,
          transformOrigin: 'center',
        }}
      >
        {geometry === null ? (
          <img
            src={src}
            alt={element.alt}
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: element.fit === 'stretch' ? 'fill' : element.fit,
            }}
          />
        ) : geometry.renderable ? (
          <div
            className="picture-fill-viewport"
            style={{
              position: 'absolute',
              overflow: 'hidden',
              left: `${(geometry.viewport.x / element.width) * 100}%`,
              top: `${(geometry.viewport.y / element.height) * 100}%`,
              width: `${(geometry.viewport.width / element.width) * 100}%`,
              height: `${(geometry.viewport.height / element.height) * 100}%`,
            }}
          >
            <img
              src={src}
              alt={element.alt}
              draggable={false}
              style={{
                position: 'absolute',
                display: 'block',
                maxWidth: 'none',
                left: `${((geometry.image.x - geometry.viewport.x) / geometry.viewport.width) * 100}%`,
                top: `${((geometry.image.y - geometry.viewport.y) / geometry.viewport.height) * 100}%`,
                width: `${(geometry.image.width / geometry.viewport.width) * 100}%`,
                height: `${(geometry.image.height / geometry.viewport.height) * 100}%`,
                objectFit: 'fill',
              }}
            />
          </div>
        ) : (
          <span role="img" aria-label={element.alt || 'Picture'} title={geometry.reason} />
        )}
      </div>
    </div>
  );
}
