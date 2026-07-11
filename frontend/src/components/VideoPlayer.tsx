// Plays a go2rtc stream by embedding its built-in player page (WebRTC with MSE
// fallback). v2: replace the iframe with go2rtc's video-rtc web component for
// tighter styling control.
export default function VideoPlayer({ playerUrl, title }: { playerUrl: string; title?: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-neutral-800 bg-black">
      {title && (
        <div className="absolute left-0 top-0 z-10 rounded-br bg-black/60 px-2 py-0.5 text-xs text-neutral-300">
          {title}
        </div>
      )}
      <iframe
        src={playerUrl}
        title={title ?? "stream"}
        className="h-full w-full"
        allow="autoplay"
      />
    </div>
  );
}
