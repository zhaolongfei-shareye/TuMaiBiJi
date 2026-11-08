on run argv
	set inPath to item 1 of argv
	set outPdf to item 2 of argv
	tell application "Microsoft Word"
		repeat while (count of documents) > 0
			close document 1 saving no
		end repeat
		open inPath
		delay 1
		set d to document 1
		try
			tell d
				if (count of tables of contents) > 0 then
					update table of contents 1
				end if
			end tell
		end try
		try
			tell d to update fields
		end try
		delay 1
		tell d to save
		save as d file name (POSIX file outPdf as string) file format format PDF
		close d saving no
		return "done"
	end tell
end run
