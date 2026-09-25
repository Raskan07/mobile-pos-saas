import { IOSSpinner } from "@/components/ui/IOSSpinner";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="flex-1 h-full w-full flex items-center justify-center min-h-[300px]"
    >
      <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#12101a]/80 border border-white/[0.08] shadow-2xl backdrop-blur-md">
        <IOSSpinner size={34} color="rgba(255, 255, 255, 0.9)" />
      </div>
    </div>
  );
}
