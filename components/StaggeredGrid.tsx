'use client'

import { type Variants, type Transition, motion } from 'framer-motion'
import { ReactNode } from 'react'

interface StaggeredGridProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
}

// Statico fuori dal componente: FM v12 ha tipi stretti su Variants,
// quindi ease va separato come Transition e passato al motion.div direttamente
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

const itemTransition: Transition = {
  duration: 0.4,
  ease: 'easeOut',
}

export function StaggeredGrid({ 
  children, 
  className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  staggerDelay = 0.05 
}: StaggeredGridProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1,
      } as Transition,
    },
  }

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
    >
      {Array.isArray(children) ? (
        children.map((child, index) => (
          <motion.div
            key={index}
            variants={itemVariants}
            transition={itemTransition}
          >
            {child}
          </motion.div>
        ))
      ) : (
        <motion.div variants={itemVariants} transition={itemTransition}>
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}

