import { Suspense } from "react";
import PaymentForm from "./PaymentForm";

export default function PaymentPage() {
  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Complete your setup
      </h1>
      <Suspense
        fallback={
          <div className="text-center text-gray-400 py-8">Loading...</div>
        }
      >
        <PaymentForm />
      </Suspense>
    </div>
  );
}
