/*
 * SessionMarkers.cpp
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
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

#include "SessionMarkers.hpp"

#include <boost/foreach.hpp>
#include <boost/algorithm/string/predicate.hpp>

#include <core/Exec.hpp>
#include <core/Settings.hpp>
#include <core/FileSerializer.hpp>

#include <r/RSexp.hpp>
#include <r/RRoutines.hpp>

#include <session/SessionModuleContext.hpp>

using namespace rstudio::core ;

namespace rstudio {
namespace session {

namespace {

json::Object sourceMarkerSetAsJson(const module_context::SourceMarkerSet& set)
{
   using namespace module_context;
   json::Object jsonSet;
   jsonSet["name"] = set.name;
   if (set.basePath.empty())
   {
      jsonSet["base_path"] = json::Value();
   }
   else
   {
      std::string basePath = createAliasedPath(set.basePath);
      // ensure that the base_path ends with "/" so that markers don't
      // display the path
      if (!boost::algorithm::ends_with(basePath, "/"))
         basePath.append("/");
      jsonSet["base_path"] = basePath;
   }
   jsonSet["markers"] = sourceMarkersAsJson(set.markers);
   return jsonSet;
}

bool isNamed(const module_context::SourceMarkerSet& set,
             const std::string& name)
{
   return set.name == name;
}


class SourceMarkers : boost::noncopyable
{
public:
   SourceMarkers()
   {
   }

   void clear()
   {
      activeSet_.clear();
      markerSets_.clear();
   }

   void setActiveMarkers(const std::string& set)
   {
      MarkerSets::iterator it = findSetByName(set);
      if (it != markerSets_.end())
         activeSet_ = set;
   }

   void setActiveMarkers(const module_context::SourceMarkerSet& markerSet)
   {
      // set active set
      activeSet_ = markerSet.name;

      // update or append as appropriate
      MarkerSets::iterator it = findSetByName(markerSet.name);
      if (it != markerSets_.end())
         *it = markerSet;
      else
         markerSets_.push_back(markerSet);
   }

   void clearActiveMarkers()
   {
      // remove the active set
      MarkerSets::iterator it = findSetByName(activeSet_);
      if (it != markerSets_.end())
         markerSets_.erase(it);
      activeSet_.clear();

      // if there are still more sets left then reset the active set
      // to the last set in the list
      if (markerSets_.size() > 0)
         activeSet_ = markerSets_.back().name;
   }

public:
   Error readFromJson(const json::Object& asJson)
   {
      std::string activeSet;
      json::Array setsJson;
      Error error = json::readObject(asJson,
                                     "active_set", &activeSet,
                                     "sets", &setsJson);
      if (error)
         return error;

      MarkerSets markerSets;

      BOOST_FOREACH(const json::Value& setJson, setsJson)
      {
         if (json::isType<json::Object>(setJson))
         {
            std::string name, basePath;
            json::Array markersJson;
            Error error = json::readObject(setJson.get_obj(),
                                           "name", &name,
                                           "base_path", &basePath,
                                           "markers", &markersJson);
            if (error)
            {
               LOG_ERROR(error);
               continue;
            }
            std::vector<module_context::SourceMarker> markers;
            BOOST_FOREACH(json::Value markerJson, markersJson)
            {
               if (json::isType<json::Object>(markerJson))
               {
                  int type;
                  std::string path;
                  int line, column;
                  std::string message;
                  bool showErrorList;
                  Error error = json::readObject(
                     markerJson.get_obj(),
                     "type", &type,
                     "path", &path,
                     "line", &line,
                     "column", &column,
                     "message", &message,
                     "show_error_list", &showErrorList);
                  if (error)
                  {
                     LOG_ERROR(error);
                     continue;
                  }

                  module_context::SourceMarker marker(
                      (module_context::SourceMarker::Type)type,
                      module_context::resolveAliasedPath(path),
                      line,
                      column,
                      message,
                      showErrorList);

                  markers.push_back(marker);
               }
            }

            using namespace module_context;
            FilePath base = !basePath.empty() ?
                       resolveAliasedPath(basePath) :
                       FilePath();

            markerSets.push_back(SourceMarkerSet(name, base, markers));
         }
      }

      activeSet_ = activeSet;
      markerSets_ = markerSets;

      return Success();
   }

   json::Object asJson() const
   {
      json::Object obj;
      obj["active_set"] = activeSet_;
      json::Array setsJson;
      std::transform(markerSets_.begin(),
                     markerSets_.end(),
                     std::back_inserter(setsJson),
                     sourceMarkerSetAsJson);
      obj["sets"] = setsJson;

      return obj;
   }

   json::Object stateAsJson() const
   {
      // default to null members
      json::Object obj;
      obj["names"] = json::Value();
      obj["markers"] = json::Value();

      // read the data
      if (!markerSets_.empty())
      {
         // names
         json::Array namesJson;
         BOOST_FOREACH(const module_context::SourceMarkerSet& set, markerSets_)
         {
            namesJson.push_back(set.name);
         }

         // markers for active set
         MarkerSets::const_iterator it = findSetByName(activeSet_);
         if (it != markerSets_.end())
         {
            obj["names"] = namesJson;
            obj["markers"] = sourceMarkerSetAsJson(*it);
         }
      }

      return obj;
   }

private:
   typedef std::vector<module_context::SourceMarkerSet> MarkerSets;
   MarkerSets::const_iterator findSetByName(const std::string& name) const
   {
      return std::find_if(markerSets_.begin(),
                          markerSets_.end(),
                          boost::bind(isNamed, _1, name));
   }

   MarkerSets::iterator findSetByName(const std::string& name)
   {
      return std::find_if(markerSets_.begin(),
                          markerSets_.end(),
                          boost::bind(isNamed, _1, name));
   }


private:
   std::string activeSet_;
   MarkerSets markerSets_;
};

SourceMarkers& sourceMarkers()
{
   static SourceMarkers instance;
   return instance;
}

void fireMarkersChanged(module_context::MarkerAutoSelect autoSelect)
{
   json::Object jsonData;
   jsonData["markers_state"] = sourceMarkers().stateAsJson();
   jsonData["auto_select"] = static_cast<int>(autoSelect);

   ClientEvent event(client_events::kMarkersChanged,jsonData);
   module_context::enqueClientEvent(event);
}

} // anonymous namespace

namespace module_context {

void showSourceMarkers(const SourceMarkerSet& markerSet,
                       MarkerAutoSelect autoSelect)
{
   sourceMarkers().setActiveMarkers(markerSet);

   fireMarkersChanged(autoSelect);
}

} // namespace module_context


namespace modules { 
namespace markers {

namespace {

Error markersTabClosed(const core::json::JsonRpcRequest& request,
                       json::JsonRpcResponse* pResponse)
{
   sourceMarkers().clear();

   fireMarkersChanged(module_context::MarkerAutoSelectNone);

   return Success();
}

Error updateActiveMarkerSet(const core::json::JsonRpcRequest& request,
                            json::JsonRpcResponse* pResponse)
{
   std::string set;
   Error error = json::readParams(request.params, &set);
   if (error)
      return error;

   sourceMarkers().setActiveMarkers(set);

   fireMarkersChanged(module_context::MarkerAutoSelectNone);

   return Success();
}

Error clearActiveMarkerSet(const core::json::JsonRpcRequest& request,
                           json::JsonRpcResponse* pResponse)
{
   sourceMarkers().clearActiveMarkers();

   fireMarkersChanged(module_context::MarkerAutoSelectNone);

   return Success();
}


SEXP rs_showMarkers(SEXP nameSEXP)
{
   using namespace module_context;
   std::vector<SourceMarker> markers;
   markers.push_back(SourceMarker(SourceMarker::Error,
                                  resolveAliasedPath("~/woozy11.cpp"),
                                  10,
                                  1,
                                  "you did this totally wrong",
                                  true));

   SourceMarkerSet markerSet(r::sexp::safeAsString(nameSEXP),
                             resolveAliasedPath("~"),
                             markers);

   showSourceMarkers(markerSet, MarkerAutoSelectFirst);

   return R_NilValue;
}

FilePath sourceMarkersFilePath()
{
   return module_context::scopedScratchPath().childPath("source_markers_db");
}

void readSourceMarkers()
{
   FilePath filePath = sourceMarkersFilePath();
   if (!filePath.exists())
      return;

   std::string contents;
   Error error = readStringFromFile(filePath, &contents);
   if (error)
   {
      LOG_ERROR(error);
      return;
   }

   json::Value stateJson;
   if (!json::parse(contents, &stateJson))
   {
      LOG_WARNING_MESSAGE("invalid session markers json");
      return;
   }

   error = sourceMarkers().readFromJson(stateJson.get_obj());
   if (error)
      LOG_ERROR(error);
}

void writeSourceMarkers(bool terminatedNormally)
{
   if (terminatedNormally)
   {
      std::ostringstream os;
      json::write(sourceMarkers().asJson(), os);
      Error error = writeStringToFile(sourceMarkersFilePath(), os.str());
      if (error)
         LOG_ERROR(error);
   }
}




} // anonymous namespace

json::Value markersStateAsJson()
{
   return sourceMarkers().stateAsJson();
}

Error initialize()
{
   // read source markers and arrange to write them at shutdown
   using namespace module_context;
   readSourceMarkers();
   events().onShutdown.connect(writeSourceMarkers);

   // register R api
   RS_REGISTER_CALL_METHOD(rs_showMarkers, 1);

   // complete initialization
   using boost::bind;
   ExecBlock initBlock ;
   initBlock.addFunctions()
      (bind(registerRpcMethod, "markers_tab_closed", markersTabClosed))
      (bind(registerRpcMethod, "update_active_marker_set", updateActiveMarkerSet))
      (bind(registerRpcMethod, "clear_active_marker_set", clearActiveMarkerSet))
      (bind(sourceModuleRFile, "SessionMarkers.R"));
   return initBlock.execute();

}
   
   
} // namespace markers
} // namespace modules
} // namesapce session
} // namespace rstudio

