import { Suspense } from "react";
import SuccessContent from "./SuccessContent";

export default function PaymentSuccessPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-16 text-center">
      <Suspense
        fallback={
          <div className="text-center text-gray-400 py-8">Loading...</div>
        }
      >
        <SuccessContent />
      </Suspense>
    </div>
  );
}
