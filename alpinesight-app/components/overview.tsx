import { motion } from "framer-motion";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <p className="text-lg md:text-5xl text-muted-foreground">
          <span className="text-amber-800">Alpine</span>sight
        </p>
        <p>Get intelligent, data supported insgihts that help your business</p>
      </div>
    </motion.div>
  );
};
