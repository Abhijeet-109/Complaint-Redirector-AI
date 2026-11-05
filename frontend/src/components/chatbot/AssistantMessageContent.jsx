import React from 'react';
import { ChatMessageMarkdown } from './ChatMessageMarkdown';
import { AgentResponseRenderer } from './AgentResponseRenderer';
import { getStructuredResponseSummary, isValidStructuredResponse } from './agentResponsePresentation';

export function AssistantMessageContent({ content, response }) {
  if (!isValidStructuredResponse(response) || response.response_type === 'text') {
    return <ChatMessageMarkdown>{content}</ChatMessageMarkdown>;
  }

  return (
    <div className="fk-assistant-structured-message">
      <p className="fk-assistant-response-summary">{getStructuredResponseSummary(response)}</p>
      <AgentResponseRenderer response={response} />
    </div>
  );
}

export default AssistantMessageContent;
