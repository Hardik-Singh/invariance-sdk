/**
 * Template registry for managing and retrieving templates.
 */

import type { TemplateId, InvarianceTemplate } from '@invariance/common';
import type { BaseTemplate } from './base.js';

/**
 * Registry for managing templates.
 * Provides storage, retrieval, and lifecycle management for templates.
 */
export class TemplateRegistry {
  private templates: Map<string, BaseTemplate> = new Map();
  private templateData: Map<string, InvarianceTemplate> = new Map();

  /**
   * Register a template instance.
   *
   * @param template - The template to register
   * @throws Error if a template with the same ID already exists
   */
  register(template: BaseTemplate): void {
    const id = template.templateId;
    if (this.templates.has(id)) {
      throw new Error(`Template with ID "${id}" already exists`);
    }
    this.templates.set(id, template);
    this.templateData.set(id, template.toTemplate());
  }

  /**
   * Register a template from raw data.
   *
   * @param data - The template data to register
   * @throws Error if a template with the same ID already exists
   */
  registerData(data: InvarianceTemplate): void {
    const id = data.options.templateId;
    if (this.templateData.has(id)) {
      throw new Error(`Template with ID "${id}" already exists`);
    }
    this.templateData.set(id, data);
  }

  /**
   * Unregister a template by ID.
   *
   * @param templateId - The template ID to unregister
   * @returns True if the template was found and removed
   */
  unregister(templateId: TemplateId | string): boolean {
    const id = templateId as string;
    const removed = this.templates.delete(id) || this.templateData.delete(id);
    return removed;
  }

  /**
   * Get a template instance by ID.
   *
   * @param templateId - The template ID to retrieve
   * @returns The template instance or undefined if not found
   */
  get(templateId: TemplateId | string): BaseTemplate | undefined {
    return this.templates.get(templateId as string);
  }

  /**
   * Get template data by ID.
   *
   * @param templateId - The template ID to retrieve
   * @returns The template data or undefined if not found
   */
  getData(templateId: TemplateId | string): InvarianceTemplate | undefined {
    return this.templateData.get(templateId as string);
  }

  /**
   * Check if a template exists.
   *
   * @param templateId - The template ID to check
   * @returns True if the template exists
   */
  has(templateId: TemplateId | string): boolean {
    const id = templateId as string;
    return this.templates.has(id) || this.templateData.has(id);
  }

  /**
   * Get all registered template IDs.
   *
   * @returns Array of template IDs
   */
  getIds(): string[] {
    const ids = new Set<string>();
    for (const id of this.templates.keys()) {
      ids.add(id);
    }
    for (const id of this.templateData.keys()) {
      ids.add(id);
    }
    return Array.from(ids);
  }

  /**
   * Get all registered templates.
   *
   * @returns Array of template instances
   */
  getAll(): BaseTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get all registered template data.
   *
   * @returns Array of template data objects
   */
  getAllData(): InvarianceTemplate[] {
    return Array.from(this.templateData.values());
  }

  /**
   * Get templates by tag.
   *
   * @param tag - The tag to filter by
   * @returns Array of template data objects with the specified tag
   */
  getByTag(tag: string): InvarianceTemplate[] {
    return this.getAllData().filter(
      (t) => t.options.tags?.includes(tag),
    );
  }

  /**
   * Get active templates only.
   *
   * @returns Array of active template data objects
   */
  getActive(): InvarianceTemplate[] {
    return this.getAllData().filter((t) => t.options.active);
  }

  /**
   * Clear all registered templates.
   */
  clear(): void {
    this.templates.clear();
    this.templateData.clear();
  }

  /**
   * Get the number of registered templates.
   */
  get size(): number {
    const ids = new Set<string>();
    for (const id of this.templates.keys()) {
      ids.add(id);
    }
    for (const id of this.templateData.keys()) {
      ids.add(id);
    }
    return ids.size;
  }
}

/**
 * Global template registry instance.
 */
export const globalRegistry = new TemplateRegistry();
