import { useState } from "react";

const App = () => {
  const [count, setCount] = useState(0);

  const increment = () => setCount((prev) => prev + 1);
  const decrement = () => setCount((prev) => prev - 1);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Counter Demo</h1>
        <div className="text-6xl font-bold text-blue-600 mb-6">{count}</div>
        <div className="space-x-4 flex">
          <button
            type="button"
            onClick={decrement}
            className="p-2 text-2xl border-2 grow"
          >
            -
          </button>
          <button
            type="button"
            onClick={increment}
            className="p-2 text-2xl border-2 grow"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
