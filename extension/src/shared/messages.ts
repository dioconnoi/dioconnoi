export type PickableField = "companyName" | "jobTitle" | "jobDescription";

/** Side panel -> background: start a "Select from Page" session for one field. */
export interface StartPickerMessage {
  type: "START_PICKER";
  field: PickableField;
}

/** Background -> content script (sent right after injection): begin picking. */
export interface BeginPickMessage {
  type: "BEGIN_PICK";
  field: PickableField;
}

/** Content script -> background -> side panel: the user picked some text. */
export interface PickedTextMessage {
  type: "PICKED_TEXT";
  field: PickableField;
  text: string;
}

/** Content script -> background -> side panel: picking ended with no selection
 * (Escape pressed, or the tab navigated/closed while picking). */
export interface PickerCancelledMessage {
  type: "PICKER_CANCELLED";
  field: PickableField;
}

export type ExtensionMessage = StartPickerMessage | BeginPickMessage | PickedTextMessage | PickerCancelledMessage;
