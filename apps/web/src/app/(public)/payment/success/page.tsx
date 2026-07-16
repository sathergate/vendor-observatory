import { Suspense } from "react";
import SuccessContent from "./SuccessContent";

export default function PaymentSuccessPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <Suspense
        fallback={
          <div className="text-center text-secondary py-8 text-[14px]">Loading...</div>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
