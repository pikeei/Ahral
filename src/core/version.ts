/**
 * Version of the extraction -> analysis -> generation pipeline.
 * Raise it when a change would produce different questions from the same PDF;
 * documents imported with an older version are then regenerated on their next import.
 */
export const PIPELINE_VERSION = 1
