package com.ssvasia.expertai.assistant;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.ssvasia.expertai.MainActivity;

public final class ExpertAiVoiceInteractionSession extends VoiceInteractionSession {
  private final Context context;

  public ExpertAiVoiceInteractionSession(Context context) {
    super(context);
    this.context = context;
  }

  @Override
  public View onCreateContentView() {
    LinearLayout panel = new LinearLayout(context);
    panel.setOrientation(LinearLayout.VERTICAL);
    panel.setPadding(dp(22), dp(20), dp(22), dp(18));
    GradientDrawable panelBackground = new GradientDrawable();
    panelBackground.setColor(Color.rgb(29, 24, 39));
    panelBackground.setCornerRadius(dp(24));
    panelBackground.setStroke(dp(1), Color.rgb(91, 76, 126));
    panel.setBackground(panelBackground);

    TextView mark = new TextView(context);
    mark.setText("✦");
    mark.setTextColor(Color.rgb(29, 24, 39));
    mark.setTextSize(20);
    mark.setGravity(android.view.Gravity.CENTER);
    GradientDrawable markBackground = new GradientDrawable();
    markBackground.setColor(Color.rgb(199, 183, 255));
    markBackground.setCornerRadius(dp(13));
    mark.setBackground(markBackground);
    panel.addView(mark, new LinearLayout.LayoutParams(dp(46), dp(46)));

    TextView title = new TextView(context);
    title.setText("Ask Expert AI");
    title.setTextColor(Color.WHITE);
    title.setTextSize(22);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(-1, -2);
    titleParams.topMargin = dp(14);
    panel.addView(title, titleParams);

    TextView detail = new TextView(context);
    detail.setText("A focused shortcut to the real Expert AI chat. It does not read your screen, control other apps, or listen in the background.");
    detail.setTextColor(Color.rgb(190, 181, 202));
    detail.setTextSize(14);
    detail.setLineSpacing(0, 1.12f);
    LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(-1, -2);
    detailParams.topMargin = dp(8);
    detailParams.bottomMargin = dp(18);
    panel.addView(detail, detailParams);

    Button open = new Button(context);
    open.setText("Open chat  →");
    open.setTextSize(14);
    open.setTextColor(Color.rgb(29, 24, 39));
    open.setAllCaps(false);
    open.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    GradientDrawable buttonBackground = new GradientDrawable();
    buttonBackground.setColor(Color.rgb(199, 183, 255));
    buttonBackground.setCornerRadius(dp(15));
    open.setBackground(buttonBackground);
    open.setMinHeight(dp(52));
    open.setPadding(dp(16), 0, dp(16), 0);
    open.setOnClickListener((View v) -> {
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setComponent(new ComponentName(context, MainActivity.class));
      intent.setData(android.net.Uri.parse("expertai://assistant"));
      intent.putExtra("expert_ai_assistant", true);
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      context.startActivity(intent);
      hide();
    });
    panel.addView(open);
    return panel;
  }

  private int dp(int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }
}
