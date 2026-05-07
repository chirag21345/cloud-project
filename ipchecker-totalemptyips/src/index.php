<?php
header("Access-Control-Allow-Origin: *");
header("Content-type: application/json");
require('functions.inc.php');

$output = array(
	"error" => false,
  "items" => "",
	"total_empty_ips" => 0
);

$items = isset($_REQUEST['items']) ? $_REQUEST['items'] : '';
if (trim($items) === '') {
  $output['error'] = true;
  $output['message'] = 'items parameter is required';
  echo json_encode($output);
  exit();
}

$total_empty_ips=getTotalEmptyIPs($items);

$output['items']=$items;
$output['total_empty_ips']=$total_empty_ips;

echo json_encode($output);
exit();
