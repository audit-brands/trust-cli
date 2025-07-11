/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';

export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionResponse)
  );
}
