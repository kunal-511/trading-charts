import React from "react";
import ClientWrapper from "./components/ClientWrapper";

const Page = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Trading Charts</h1>
          <div className="text-sm text-gray-500">
            Powered by Lightweight Charts
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <ClientWrapper />
      </main>

      <footer className="bg-white mt-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 text-center">
            Data provided by Binance API. This is for demonstration purposes
            only.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Page;
