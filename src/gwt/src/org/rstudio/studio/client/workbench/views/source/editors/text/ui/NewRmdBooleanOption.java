/*
 * NewRmdBooleanOption.java
 *
 * Copyright (C) 2009-14 by RStudio, Inc.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client.workbench.views.source.editors.text.ui;

import org.rstudio.studio.client.rmarkdown.model.RmdTemplateFormatOption;

import com.google.gwt.user.client.ui.CheckBox;

public class NewRmdBooleanOption extends NewRmdBaseOption
{
   public NewRmdBooleanOption(RmdTemplateFormatOption option)
   {
      super(option);
      checkBox_ = new CheckBox(option.getUiName());
      defaultValue_ = Boolean.parseBoolean(option.getDefaultValue());
      checkBox_.setValue(defaultValue_);
      initWidget(checkBox_);
   }

   @Override
   public boolean valueIsDefault()
   {
      return defaultValue_ == checkBox_.getValue();
   }

   @Override
   public String getValue()
   {
      return checkBox_.getValue().toString();
   }
   
   private boolean defaultValue_;
   private CheckBox checkBox_;
}
