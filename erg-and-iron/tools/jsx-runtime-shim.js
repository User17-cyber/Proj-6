// The React UMD build has no jsx-runtime, so the standalone bundle maps the
// automatic JSX runtime onto React.createElement.
import React from 'react';

export const Fragment = React.Fragment;

export function jsx(type, props, key) {
  const { children, ...rest } = props;
  if (key !== undefined) rest.key = key;
  if (children === undefined) return React.createElement(type, rest);
  return Array.isArray(children)
    ? React.createElement(type, rest, ...children)
    : React.createElement(type, rest, children);
}

export const jsxs = jsx;
