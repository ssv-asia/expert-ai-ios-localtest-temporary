package com.ssvasia.expertai.assistant;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

public final class ExpertAiVoiceInteractionSessionService extends VoiceInteractionSessionService {
  @Override
  public VoiceInteractionSession onNewSession(Bundle args) {
    return new ExpertAiVoiceInteractionSession(this);
  }
}
