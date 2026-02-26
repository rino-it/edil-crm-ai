'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface StaggeredGridProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
}

export function StaggeredGrid({ 
  children, 
  className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
  staggerDelay = 0.05 
}: StaggeredGridProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.4,
        ease: 'easeOut',
      },
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
          >
            {child}
          </motion.div>
        ))
      ) : (
        <motion.div variants={itemVariants}>
          {children}
        </motion.div>
      )}
    </motion.div>
  )
}
