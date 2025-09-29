import './register-dom-placeholders';

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

import { cleanupDom, setupDom, ElementNode, MinimalEvent } from './minimal-dom';

type Matcher = string | RegExp;

type RenderResult = {
  container: HTMLElement;
  rerender: (ui: React.ReactElement) => void;
  unmount: () => void;
};

setupDom();

let envInitialized = true;
const mountedRoots: Array<{ root: Root; container: ElementNode }> = [];

function ensureEnvironment() {
  if (!envInitialized) {
    setupDom();
    envInitialized = true;
  }
}

export function render(ui: React.ReactElement): RenderResult {
  ensureEnvironment();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container as unknown as HTMLElement);
  act(() => {
    root.render(ui);
  });
  mountedRoots.push({ root, container: container as ElementNode });
  return {
    container: container as unknown as HTMLElement,
    rerender(nextUi: React.ReactElement) {
      act(() => {
        root.render(nextUi);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  };
}

export function cleanup() {
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
  cleanupDom();
  envInitialized = false;
}

function getAllElements(root: any): ElementNode[] {
  const nodes: ElementNode[] = [];
  if (root && root.childNodes) {
    root.childNodes.forEach((child: any) => {
      if (child.nodeType === 1) {
        nodes.push(child as ElementNode);
        nodes.push(...getAllElements(child));
      }
    });
  }
  return nodes;
}

function matchesText(element: ElementNode, matcher: Matcher) {
  const text = element.textContent || '';
  if (typeof matcher === 'string') {
    return text.includes(matcher);
  }
  return matcher.test(text);
}

function queryAllByText(matcher: Matcher): ElementNode[] {
  ensureEnvironment();
  const body = document.body as ElementNode;
  return getAllElements(body).filter(element => matchesText(element, matcher));
}

function getByText(matcher: Matcher) {
  const results = queryAllByText(matcher);
  if (results.length === 0) {
    throw new Error(`Unable to find an element with text: ${matcher}`);
  }
  return results[0] as unknown as HTMLElement;
}

function queryByText(matcher: Matcher) {
  const results = queryAllByText(matcher);
  return results[0] ? (results[0] as unknown as HTMLElement) : null;
}

function getAllByTestId(testId: string) {
  ensureEnvironment();
  const body = document.body as ElementNode;
  return getAllElements(body).filter(element => element.getAttribute('data-testid') === testId);
}

function getByTestId(testId: string) {
  const results = getAllByTestId(testId);
  if (results.length === 0) {
    throw new Error(`Unable to find an element by data-testid: ${testId}`);
  }
  return results[0] as unknown as HTMLElement;
}

function queryByTestId(testId: string) {
  const results = getAllByTestId(testId);
  return results[0] ? (results[0] as unknown as HTMLElement) : null;
}

function roleMatches(element: ElementNode, role: string) {
  const explicit = element.getAttribute('role');
  if (explicit) {
    return explicit === role;
  }
  const implicitRoles: Record<string, string[]> = {
    button: ['BUTTON', 'INPUT'],
    textbox: ['INPUT', 'TEXTAREA'],
    alert: ['DIV', 'P', 'SPAN']
  };
  const tagRoles = implicitRoles[role];
  if (!tagRoles) return false;
  if (element.tagName === 'INPUT') {
    const type = (element.getAttribute('type') || '').toLowerCase();
    if (role === 'button') {
      return type === 'button' || type === 'submit' || type === 'reset';
    }
    if (role === 'textbox') {
      return type === 'text' || type === 'search' || type === 'email' || type === '';
    }
  }
  return tagRoles.includes(element.tagName);
}

function getByRole(role: string) {
  ensureEnvironment();
  const body = document.body as ElementNode;
  const match = getAllElements(body).find(element => roleMatches(element, role));
  if (!match) {
    throw new Error(`Unable to find an element with role: ${role}`);
  }
  return match as unknown as HTMLElement;
}

export const screen = {
  getByText,
  queryByText,
  getByTestId,
  queryByTestId,
  getByRole
};

export function waitFor<T>(callback: () => T, { timeout = 2000, interval = 50 } = {}): Promise<T> {
  ensureEnvironment();
  const start = Date.now();
  return new Promise<T>((resolve, reject) => {
    const check = () => {
      try {
        const result = callback();
        resolve(result);
      } catch (error) {
        if (Date.now() - start >= timeout) {
          reject(error);
        } else {
          setTimeout(check, interval);
        }
      }
    };
    check();
  });
}

export type FireEventInit = {
  target?: Record<string, any>;
  bubbles?: boolean;
};

function dispatch(element: any, type: string, init: FireEventInit = {}) {
  ensureEnvironment();
  if (init.target) {
    if ('value' in init.target) {
      element.value = init.target.value;
    }
    if ('checked' in init.target) {
      element.checked = init.target.checked;
    }
  }
  const event = new MinimalEvent(type, { bubbles: init.bubbles !== false, target: element });
  return element.dispatchEvent(event);
}

export const fireEvent = Object.assign(
  (element: any, type: string, init: FireEventInit = {}) => dispatch(element, type, init),
  {
    click(element: any, init: FireEventInit = {}) {
      return dispatch(element, 'click', { bubbles: true, ...init });
    },
    input(element: any, init: FireEventInit = {}) {
      return dispatch(element, 'input', { bubbles: true, ...init });
    },
    change(element: any, init: FireEventInit = {}) {
      return dispatch(element, 'change', { bubbles: true, ...init });
    }
  }
);

export { act };
