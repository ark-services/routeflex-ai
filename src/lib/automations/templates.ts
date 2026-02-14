export function renderTemplate(template: string, context: any): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    const trimmedPath = path.trim();
    if (trimmedPath.startsWith('column:')) {
      const columnName = trimmedPath.substring(7).trim();
      return context.column?.[columnName] || '';
    }
    const value = path.split('.').reduce((current: any, key: string) => current?.[key], context);
    return value !== null && value !== undefined ? String(value) : '';
  });
}
