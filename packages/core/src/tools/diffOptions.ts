/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as Diff from 'diff';

export const DEFAULT_DIFF_OPTIONS: Diff.PatchOptions = {
  context: 3,
  ignoreWhitespace: true,
};
