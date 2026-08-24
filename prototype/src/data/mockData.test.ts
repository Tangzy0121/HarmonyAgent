import { describe, expect, it } from 'vitest'

import { mockProjects, mockRecommendations, projectPrimaryAction, projectStatusLabel } from './mockData'
import type { LearningBlock, ProjectStatus } from '../types/product'

describe('prototype mock coverage', () => {
  it('provides a project for every lifecycle state', () => {
    const expected: ProjectStatus[] = ['draft', 'preparing', 'plan_ready', 'active', 'blocked', 'completed', 'archived']
    expect(new Set(mockProjects.map((project) => project.status))).toEqual(new Set(expected))
  })

  it('provides every learning block defined by the product specification', () => {
    const expected: Array<LearningBlock['type']> = ['explanation', 'example', 'formula_or_conclusion', 'citation', 'quiz', 'feynman']
    const actual = mockProjects.flatMap((project) => project.chapters).flatMap((chapter) => chapter.blocks).map((block) => block.type)
    expect(new Set(actual)).toEqual(new Set(expected))
  })

  it('gives every lifecycle state a visible label and primary action', () => {
    for (const project of mockProjects) {
      expect(projectStatusLabel(project.status)).not.toHaveLength(0)
      expect(projectPrimaryAction(project)).not.toHaveLength(0)
    }
  })

  it('keeps every concept relation traceable to a mock source anchor', () => {
    for (const project of mockProjects) {
      const anchorIds = new Set(project.anchors.map((anchor) => anchor.id))
      for (const relation of project.relations) {
        expect(relation.sourceIds.length).toBeGreaterThan(0)
        expect(relation.sourceIds.every((id) => anchorIds.has(id))).toBe(true)
      }
    }
  })

  it('gives Today recommendations stable, distinct card tones', () => {
    expect(mockRecommendations.map((recommendation) => recommendation.tone)).toEqual(['blue', 'mist', 'stone'])
  })
})
