#!/usr/bin/env ruby
require 'xcodeproj'

project_path = File.join(Dir.pwd, 'ios', 'App', 'App.xcodeproj')
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |item| item.name == 'App' }
abort("Could not find Xcode target 'App'") unless target

# Put the source in the group that contains BridgeViewController.swift, falling back to main group.
find_group = lambda do |group|
  return group if group.files.any? { |file| File.basename(file.path.to_s) == 'BridgeViewController.swift' }
  group.groups.each do |child|
    found = find_group.call(child)
    return found if found
  end
  nil
end
group = find_group.call(project.main_group) || project.main_group
plugin_path = 'RollPlatformPlugin.swift'
file_ref = group.files.find { |file| File.basename(file.path.to_s) == plugin_path }
file_ref ||= group.new_file(plugin_path)
phase = target.source_build_phase
unless phase.files_references.include?(file_ref)
  phase.add_file_reference(file_ref)
end
project.save
puts "Registered #{plugin_path} in Xcode target #{target.name}."
