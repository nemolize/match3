import { MotionConfig } from "motion/react";

import { Match3Game } from "@/components/Match3Game";

const App = () => {
  return (
    <MotionConfig reducedMotion="user">
      <Match3Game />
    </MotionConfig>
  );
};

export default App;
