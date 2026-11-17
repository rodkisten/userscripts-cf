// TODO: integrar ao cuntime ctx.utils.css

/**
 * Opções para a aplicação de propriedades de estilo via CSSOM.
 */
export interface SetStyleOptions {
  /**
   * Se verdadeiro, aplica a flag 'important' na propriedade de estilo.
   * @default false
   */
  important?: boolean;
}

/**
 * Aplica uma propriedade de estilo de forma segura, tipada e sem o uso de `any`
 * em um elemento DOM, utilizando `element.style.setProperty`.
 *
 * @template K - Chave válida das propriedades CSS suportadas pelo elemento.
 * @param element - O elemento de destino (HTMLElement, SVGElement ou Element com suporte a style).
 * @param property - O nome da propriedade CSS (ex: 'background-color', 'z-index').
 * @param value - O valor correspondente à propriedade CSS.
 * @param options - Opções adicionais, como a prioridade `important`.
 */
export function setCssProperty<K extends keyof CSSStyleDeclaration>(
  element: HTMLElement | SVGElement | { style: CSSStyleDeclaration },
  property: K,
  value: CSSStyleDeclaration[K] | string,
  options?: SetStyleOptions
): void {
  const priority = options?.important ? "important" : "";
  
  // Garantimos a compatibilidade de tipos convertendo a propriedade para string limpa
  element.style.setProperty(property as string, String(value), priority);
}

/**
 * Aplica múltiplas propriedades de estilo de uma só vez a um elemento de forma tipada.
 * 
 * @param element - O elemento de destino.
 * @param styles - Um objeto contendo pares de propriedades e valores CSS.
 * @param options - Opções globais de aplicação (ex: important).
 */
export function setCssProperties(
  element: HTMLElement | SVGElement | { style: CSSStyleDeclaration },
  styles: Partial<Record<keyof CSSStyleDeclaration, string | number>>,
  options?: SetStyleOptions
): void {
  for (const [property, value] of Object.entries(styles)) {
    if (value !== undefined && value !== null) {
      setCssProperty(
        element,
        property as keyof CSSStyleDeclaration,
        String(value),
        options
      );
    }
  }
}
